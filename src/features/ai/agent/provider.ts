import { AiError, readError } from '../client';
import { callIncluded } from '../included';
import type { AiSettings } from '../settings-store';
import { loadAttachment, type LoadedAttachment } from './attachments';
import type { AgentMessage, ToolCall, ToolSpec } from './types';

export type ModelReply = { text: string; toolCalls: ToolCall[] };

const MAX_MESSAGES = 60;

/**
 * The last messages that fit the model's context, starting at a user message so a tool call is
 * never separated from its result.
 */
export function recentMessages(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= MAX_MESSAGES) return messages;
  const tail = messages.slice(-MAX_MESSAGES);
  const start = tail.findIndex((m) => m.role === 'user');
  return start < 0 ? tail : tail.slice(start);
}

/** Attachment contents by id, read from the device just before a request. */
type Files = Map<string, LoadedAttachment>;

/** Only the attachments of the last few user messages are sent again (they cost tokens each turn). */
const RESEND_ATTACHMENTS = 3;

export async function loadFiles(messages: AgentMessage[]): Promise<Files> {
  const recent = messages
    .filter((m) => m.role === 'user' && m.attachments?.length)
    .slice(-RESEND_ATTACHMENTS);
  const files: Files = new Map();
  for (const m of recent)
    for (const a of (m.role === 'user' && m.attachments) || []) {
      const loaded = await loadAttachment(a);
      if (loaded) files.set(a.id, loaded);
    }
  return files;
}

/** A message's attachments as sent: the content when loaded, otherwise a one-line note. */
function attached(m: Extract<AgentMessage, { role: 'user' }>, files: Files): LoadedAttachment[] {
  return (m.attachments ?? []).map(
    (a) => files.get(a.id) ?? { ...a, kind: 'text', text: `(${a.name} was attached earlier)` },
  );
}

const fileText = (a: LoadedAttachment) =>
  a.text?.startsWith('(') && a.text.endsWith('attached earlier)')
    ? a.text
    : `File ${a.name}:\n${a.text ?? ''}`;
const dataUrl = (a: LoadedAttachment) => `data:${a.mime};base64,${a.base64 ?? ''}`;

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export function toAnthropicMessages(messages: AgentMessage[], files: Files = new Map()) {
  return messages.map((m) => {
    if (m.role === 'user') {
      const parts = attached(m, files);
      if (parts.length === 0) return { role: 'user' as const, content: m.text };
      const content: AnthropicBlock[] = parts.map((a) =>
        a.kind === 'text'
          ? { type: 'text', text: fileText(a) }
          : {
              type: a.kind === 'pdf' ? 'document' : 'image',
              source: { type: 'base64', media_type: a.mime, data: a.base64 ?? '' },
            },
      );
      if (m.text) content.push({ type: 'text', text: m.text });
      return { role: 'user' as const, content };
    }
    if (m.role === 'assistant') {
      const content: AnthropicBlock[] = [];
      if (m.text) content.push({ type: 'text', text: m.text });
      for (const c of m.toolCalls)
        content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input });
      return { role: 'assistant' as const, content };
    }
    return {
      role: 'user' as const,
      content: m.results.map<AnthropicBlock>((r) => ({
        type: 'tool_result',
        tool_use_id: r.callId,
        content: r.content,
        ...(r.outcome === 'error' ? { is_error: true } : {}),
      })),
    };
  });
}

type OpenAiPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

type OpenAiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OpenAiPart[] }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export function toOpenAiMessages(
  system: string,
  messages: AgentMessage[],
  files: Files = new Map(),
): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') {
      const parts = attached(m, files);
      if (parts.length === 0) {
        out.push({ role: 'user', content: m.text });
        continue;
      }
      const content: OpenAiPart[] = parts.map((a) =>
        a.kind === 'text'
          ? { type: 'text', text: fileText(a) }
          : a.kind === 'pdf'
            ? { type: 'file', file: { filename: a.name, file_data: dataUrl(a) } }
            : { type: 'image_url', image_url: { url: dataUrl(a) } },
      );
      if (m.text) content.push({ type: 'text', text: m.text });
      out.push({ role: 'user', content });
    } else if (m.role === 'assistant')
      out.push({
        role: 'assistant',
        content: m.text || null,
        ...(m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              })),
            }
          : {}),
      });
    else
      for (const r of m.results)
        out.push({ role: 'tool', tool_call_id: r.callId, content: r.content });
  }
  return out;
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    const value = JSON.parse(String(raw || '{}'));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * One model turn with tools. The request goes straight from the device to the provider with the
 * user's own key: nothing passes through our servers.
 */
export async function callModel(
  settings: AiSettings,
  system: string,
  messages: AgentMessage[],
  tools: ToolSpec[],
  signal?: AbortSignal,
): Promise<ModelReply> {
  const key = settings.apiKey.trim();
  const recent = recentMessages(messages);
  const files = await loadFiles(recent);
  const openAiTools = tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.schema },
  }));

  if (settings.provider === 'included') {
    const data = await callIncluded({
      messages: toOpenAiMessages(system, recent, files),
      tools: openAiTools,
    });
    return fromOpenAi(data);
  }

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
      body: JSON.stringify({
        model: settings.model.trim(),
        max_tokens: 4096,
        system,
        messages: toAnthropicMessages(recent, files),
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.schema,
        })),
      }),
    });
    if (!res.ok) throw new AiError(await readError(res), res.status);
    const data = (await res.json()) as {
      content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
    };
    const blocks = data.content ?? [];
    return {
      text: blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join(''),
      toolCalls: blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({ id: String(b.id), name: String(b.name), input: parseArguments(b.input) })),
    };
  }

  const base = settings.baseUrl.trim().replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: settings.model.trim(),
      messages: toOpenAiMessages(system, recent, files),
      tools: openAiTools,
    }),
  });
  if (!res.ok) throw new AiError(await readError(res), res.status);
  return fromOpenAi(await res.json());
}

/** An OpenAI-style reply (OpenAI, OpenRouter, our included AI) -> text and tool calls. */
function fromOpenAi(raw: unknown): ModelReply {
  const data = raw as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id: string; function: { name: string; arguments: string } }[];
      };
    }[];
  };
  const message = data.choices?.[0]?.message;
  return {
    text: message?.content ?? '',
    toolCalls: (message?.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      input: parseArguments(c.function.arguments),
    })),
  };
}
