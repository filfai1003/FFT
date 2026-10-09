import type { AiSettings } from './settings-store';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }

  /** The provider refused the key (missing, wrong, revoked or without access to the model). */
  get isKeyProblem(): boolean {
    return (
      this.status === 401 ||
      this.status === 403 ||
      /api[_ -]?key|authenticat|unauthori|permission|access/i.test(this.message)
    );
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
    const e = body.error;
    return (typeof e === 'string' ? e : e?.message) ?? body.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * One reply from the user's own AI account. The request goes straight from the device to the
 * provider with the user's key: nothing passes through our servers.
 */
export async function chatComplete(
  settings: AiSettings,
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const key = settings.apiKey.trim();
  if (settings.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // Needed for calls made from a browser (the web version of the app).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: settings.model.trim(), max_tokens: 4096, system, messages }),
    });
    if (!res.ok) throw new AiError(await readError(res), res.status);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    if (!text) throw new AiError('Empty reply');
    return text;
  }
  const base = settings.baseUrl.trim().replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: settings.model.trim(),
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new AiError(await readError(res), res.status);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new AiError('Empty reply');
  return text;
}
