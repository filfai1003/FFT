import type { Attachment } from './attachments';

/** One tool the assistant asked to use. */
export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

/**
 * How a tool call ended: `done`, `rejected` (the user said no), `error`, `undone` (the user took
 * the change back afterwards) or `cancelled` (the app was closed before it was answered).
 */
export type ToolOutcome = 'done' | 'rejected' | 'error' | 'undone' | 'cancelled';

export type ToolResult = {
  callId: string;
  /** What the model is told (JSON text). */
  content: string;
  outcome: ToolOutcome;
};

/** A conversation message in a provider-neutral shape (converted for each provider when sent). */
export type AgentMessage =
  | { id: string; role: 'user'; text: string; attachments?: Attachment[] }
  | { id: string; role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { id: string; role: 'tool'; results: ToolResult[] };

export type Conversation = {
  id: string;
  /** The account it belongs to: another account on the same phone never sees it. */
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
};

/** What the model sees of a tool. */
export type ToolSpec = {
  name: string;
  description: string;
  /** JSON schema of the input object. */
  schema: Record<string, unknown>;
};

export type ToolRun = {
  /** What the model is told about the result. */
  content: unknown;
  /** Takes the change back (shown as UNDO). */
  undo?: () => Promise<void>;
};

/** One line of an approval card: a field name (translated in the app) and its value. */
export type ChangeLine = { label: string; value: string };

export type ToolDef = ToolSpec & {
  /** Writes change the user's data: they are shown first and run only after an approval. */
  write?: boolean;
  /** Lines for the approval card: what will change (may look up names, e.g. a food from its id). */
  describe?: (input: Record<string, unknown>) => ChangeLine[] | Promise<ChangeLine[]>;
  run: (input: Record<string, unknown>) => Promise<ToolRun>;
};
