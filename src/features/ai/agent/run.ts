import { newId } from '@/lib/uuid';
import { AiError } from '../client';
import type { AiSettings } from '../settings-store';
import { callModel } from './provider';
import type { AgentMessage, ToolCall, ToolDef, ToolOutcome, ToolResult } from './types';

/** The model may chain tools (look, then change, then check); this stops a runaway loop. */
export const MAX_STEPS = 20;
const MAX_RESULT_CHARS = 12_000;

export type Approval = 'approved' | 'rejected';

/** UNDO closures of the changes made in this app session, by tool call id. */
const undoers = new Map<string, () => Promise<void>>();
export const canUndo = (callId: string) => undoers.has(callId);

export async function undoCall(callId: string): Promise<boolean> {
  const undo = undoers.get(callId);
  if (!undo) return false;
  undoers.delete(callId);
  await undo();
  return true;
}

function stringify(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_RESULT_CHARS
    ? `${text.slice(0, MAX_RESULT_CHARS)}… [cut: ask for a narrower range]`
    : text;
}

const failure = (message: string): ToolResult & { outcome: ToolOutcome } => ({
  callId: '',
  content: JSON.stringify({ error: message }),
  outcome: 'error',
});

/** Runs one tool call: reads run at once; writes wait for the user's approval first. */
export async function runTool(
  call: ToolCall,
  tools: ToolDef[],
  approve: (call: ToolCall, def: ToolDef) => Promise<Approval>,
): Promise<ToolResult> {
  const def = tools.find((t) => t.name === call.name);
  if (!def) return { ...failure(`Unknown tool "${call.name}"`), callId: call.id };
  try {
    if (def.write) {
      const answer = await approve(call, def);
      if (answer === 'rejected')
        return {
          callId: call.id,
          outcome: 'rejected',
          content: JSON.stringify({ rejected: 'The user did not approve this change.' }),
        };
    }
    const out = await def.run(call.input);
    if (out.undo) undoers.set(call.id, out.undo);
    return { callId: call.id, outcome: 'done', content: stringify(out.content) };
  } catch (e) {
    if (e instanceof AiError || (e instanceof Error && e.name === 'AbortError')) throw e;
    return { ...failure(e instanceof Error ? e.message : String(e)), callId: call.id };
  }
}

/**
 * The agent loop: ask the model, run the tools it asks for, give it the results, until it answers
 * with plain text. Every new message is handed to `onMessage` as it happens (and saved by the
 * caller), so the conversation is never lost, even if a step fails.
 */
export async function runAgent(opts: {
  settings: AiSettings;
  system: string;
  messages: AgentMessage[];
  tools: ToolDef[];
  approve: (call: ToolCall, def: ToolDef) => Promise<Approval>;
  onMessage: (m: AgentMessage) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const history = [...opts.messages];
  const push = (m: AgentMessage) => {
    history.push(m);
    opts.onMessage(m);
  };
  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await callModel(opts.settings, opts.system, history, opts.tools, opts.signal);
    if (!reply.text && reply.toolCalls.length === 0) throw new AiError('Empty reply');
    push({ id: newId(), role: 'assistant', text: reply.text, toolCalls: reply.toolCalls });
    if (reply.toolCalls.length === 0) return;
    const results: ToolResult[] = [];
    for (const call of reply.toolCalls) results.push(await runTool(call, opts.tools, opts.approve));
    push({ id: newId(), role: 'tool', results });
  }
  push({
    id: newId(),
    role: 'assistant',
    text: 'I stopped here after many steps. Tell me how to continue.',
    toolCalls: [],
  });
}

/**
 * A conversation that was interrupted (the app closed while a change was waiting for approval)
 * has tool calls without results; the provider would refuse it, so they are closed as cancelled.
 */
export function repairMessages(messages: AgentMessage[]): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    out.push(m);
    if (m.role !== 'assistant' || m.toolCalls.length === 0) continue;
    const next = messages[i + 1];
    const answered = new Set(next?.role === 'tool' ? next.results.map((r) => r.callId) : []);
    const missing = m.toolCalls.filter((c) => !answered.has(c.id));
    if (missing.length === 0) continue;
    const cancelled = missing.map<ToolResult>((c) => ({
      callId: c.id,
      outcome: 'cancelled',
      content: JSON.stringify({ cancelled: 'The app was closed before this was answered.' }),
    }));
    if (next?.role === 'tool') {
      out.push({ ...next, results: [...next.results, ...cancelled] });
      i++;
    } else {
      out.push({ id: newId(), role: 'tool', results: cancelled });
    }
  }
  return out;
}
