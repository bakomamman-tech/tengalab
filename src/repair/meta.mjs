import { REPAIR_IDS } from './engine.mjs';

export async function proposeRepair({
  evidence,
  apiKey = process.env.MODEL_API_KEY,
  model = process.env.META_MODEL || 'muse-spark-1.3',
  fetchImpl = fetch
} = {}) {
  if (!apiKey || apiKey === 'replace-me') {
    throw new Error('MODEL_API_KEY is missing');
  }

  if (!evidence ||
      evidence.candidate !== 'buggy' ||
      !evidence.isFullSuite ||
      evidence.passed ||
      !Array.isArray(evidence.results) ||
      evidence.results.length !== 6) {
    throw new Error('Expected a failed full-suite buggy baseline');
  }

  const response = await fetchImpl(
    'https://api.meta.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'developer',
            content:
              'You are TengaLab repair planner. Choose one approved repair recipe based on experimental evidence. You cannot execute code or approve repairs. Return schema-compliant JSON only.'
          },
          {
            role: 'user',
            content: JSON.stringify({
              goal: 'Repair premature receiver shutdown while preserving legitimate termination.',
              observations: evidence.results.map(r => ({
                experiment: r.experiment,
                passed: r.passed,
                observed: r.observed
              })),
              recipes: {
                lag_only:
                  'Tolerate receiver lag without changing the existing shutdown guard.',
                lag_and_shutdown:
                  'Tolerate receiver lag and honor the sticky shutdown flag.'
              }
            })
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'tengalab_repair_selection',
            schema: {
              type: 'object',
              properties: {
                recipeId: {
                  type: 'string',
                  enum: REPAIR_IDS
                },
                rationale: { type: 'string' }
              },
              required: ['recipeId', 'rationale'],
              additionalProperties: false
            }
          }
        }
      }),
      signal: AbortSignal.timeout(45000)
    }
  );

  if (!response.ok) {
    throw new Error(`Meta API returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;

  if (typeof raw !== 'string') {
    throw new Error('Meta returned no usable content');
  }

  const proposed = JSON.parse(raw);

  if (!REPAIR_IDS.includes(proposed?.recipeId) ||
      typeof proposed.rationale !== 'string' ||
      !proposed.rationale.trim()) {
    throw new Error('Invalid or unauthorized repair recipe');
  }

  return {
    recipeId: proposed.recipeId,
    rationale: proposed.rationale.trim(),
    provider: `meta:${model}`,
    tokenUsage: data.usage ?? null
  };
}
