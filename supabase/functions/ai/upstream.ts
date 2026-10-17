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
 * The request sent to OpenRouter. It carries no identifier: no `user` field, no account or user
 * id, no name or email (the user id is used on our server only, for the plan and the credit).
 * Only providers that neither store nor train on prompts (`data_collection: 'deny'`) and only
 * zero data retention endpoints (`zdr: true`, OpenRouter provider routing).
 */
export function upstreamBody(model: string, messages: unknown[], tools?: unknown) {
  return {
    model,
    messages: upstreamMessages(messages),
    ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
    max_tokens: MAX_TOKENS,
    usage: { include: true },
    provider: { data_collection: 'deny', zdr: true },
  };
}
