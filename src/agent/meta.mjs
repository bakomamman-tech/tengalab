/**
 * Minimal verified Meta Model API adapter. No dependency installation needed.
 * This SELECTS experiments. No ability to execute arbitrary shell commands,
 * edit user files, read secrets, or mark a candidate approved.
 */
export async function metaDecision({ available, history, candidate }) {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey || apiKey === 'replace-me') {
    throw new Error('MODEL_API_KEY is not set. Use --agent deterministic first.');
  }
  const model = process.env.META_MODEL || 'muse-spark-1.3';
  const response = await fetch('https://api.meta.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'developer',
          content: 'You are TengaLab investigator. Choose the next experiment to maximally distinguish competing failure causes and check invariants. You cannot declare repairs approved. Do not invent test observations. Return only schema-compliant JSON.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            goal: 'Investigate an event-driven service where bursts may cause premature shutdown. Test whether a candidate fix preserves legitimate shutdown.',
            candidate,
            availableExperiments: available,
            experimentPurposes: {
              steady: 'normal traffic', burst: 'lag under burst', shutdown: 'explicit termination',
              close: 'channel closure', overflow_then_shutdown: 'shutdown after overflow', lag_then_close: 'closure after overflow',
            },
            observations: history.map(({ experiment, passed, observed }) => ({ experiment, passed, observed })),
            instruction: 'Choose exactly one remaining experiment. Explain what its result would help determine.',
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'tengalab_experiment_selection',
          schema: {
            type: 'object',
            properties: {
              nextExperiment: { type: 'string', enum: available },
              rationale: { type: 'string' },
            },
            required: ['nextExperiment', 'rationale'],
            additionalProperties: false,
          },
        },
      },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Meta Model API returned HTTP ${response.status}: ${detail}`);
  }
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') throw new Error('Meta returned no usable message content');
  const parsed = JSON.parse(raw);
  if (!available.includes(parsed.nextExperiment) || typeof parsed.rationale !== 'string' || !parsed.rationale.trim()) {
    throw new Error('Meta selected an unauthorized experiment or omitted rationale');
  }
  return { ...parsed, provider: `meta:${model}`, tokenUsage: data.usage ?? null };
}
