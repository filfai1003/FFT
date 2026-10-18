// What the `ai` function sends to OpenRouter (DECISIONS 66). Pure, no imports: tested with Jest
// (src/features/ai/anonymity.test.ts).

/** One answer can never cost more than this many output tokens. */
export const MAX_TOKENS = 2048;

/**
 * Only the fields a chat message needs go upstream: role, content, tool calls. Anything else the
 * app might add (a name, ids, metadata) is dropped, so nothing that could tell who the user is
 * reaches OpenRouter.
 */
const MESSAGE_KEYS = ['role', 'content', 'tool_calls', 'tool_call_id'] as const;

export function upstreamMessages(messages: unknown[]): Record<string, unknown>[] {
  return messages.map((m) => {
    const src = (m ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of MESSAGE_KEYS) if (k in src) out[k] = src[k];
    return out;
  });
}

/**
 * The only OpenRouter providers the coach may use (DECISIONS 88), tried in this order: Nebius
 * (Netherlands, EU) first, then DeepInfra, Together and Fireworks (United States). All four serve
 * deepseek/deepseek-v4.1-flash with zero data retention (checked 2026-10-18 on
 * openrouter.ai/api/v1/endpoints/zdr). The privacy policy names them: change both together.
 */
export const DEFAULT_PROVIDERS: readonly string[] = [
  'nebius',
  'deepinfra',
  'together',
  'fireworks',
];

/** An OpenRouter provider slug, optionally with an endpoint tag ("deepinfra", "baseten/us"). */
const PROVIDER_SLUG = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9._-]+)*$/;

/**
 * The provider list from the admin setting or the AI_PROVIDERS variable: slugs separated by
 * commas or spaces, lower case, duplicates dropped. Nothing usable (empty, or any slug that is not
 * a slug) gives null, so the caller falls back to the next source and never to "any provider".
 */
export function parseProviders(value: unknown): string[] | null {
  if (typeof value !== 'string') return null;
  const slugs = value
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (slugs.length === 0 || slugs.some((s) => !PROVIDER_SLUG.test(s))) return null;
  return [...new Set(slugs)];
}

/**
 * The request sent to OpenRouter. It carries no identifier: no `user` field, no account or user
 * id, no name or email (the user id is used on our server only, for the plan and the credit).
 * Only the listed providers (`only`, tried in `order`, `allow_fallbacks: false`: never another
 * one), and among their endpoints only those that neither store nor train on prompts
 * (`data_collection: 'deny'`) and keep nothing (`zdr: true`, OpenRouter provider routing).
 */
export function upstreamBody(
  model: string,
  messages: unknown[],
  tools?: unknown,
  providers: readonly string[] = DEFAULT_PROVIDERS,
) {
  const allowed = providers.length > 0 ? [...providers] : [...DEFAULT_PROVIDERS];
  return {
    model,
    messages: upstreamMessages(messages),
    ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
    max_tokens: MAX_TOKENS,
    usage: { include: true },
    provider: {
      only: allowed,
      order: allowed,
      allow_fallbacks: false,
      data_collection: 'deny',
      zdr: true,
    },
  };
}
