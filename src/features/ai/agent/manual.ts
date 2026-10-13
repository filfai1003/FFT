import { FORMAT_EXAMPLE, extractJson, formatRules } from '@/domain/plan-import';
import type { ToolDef } from './types';

/** The changes (other than plans) an AI may ask for in manual mode: the same tools as the chat. */
export const manualActionTools = (tools: ToolDef[]) =>
  tools.filter((t) => t.write && t.name !== 'propose_plans');

function fieldLines(schema: Record<string, unknown>): string {
  const props = (schema.properties ?? {}) as Record<
    string,
    { type?: string; description?: string }
  >;
  return Object.entries(props)
    .map(([key, p]) => `    ${key} (${p.type ?? 'text'}): ${p.description ?? ''}`.trimEnd())
    .join('\n');
}

/**
 * The prompt of manual mode: who the AI is, what I ask, my data right now, and how to answer
 * (plain text for questions; JSON with plans and/or `actions` when something should change).
 */
export function buildManualPrompt(ctx: {
  request: string;
  profile: string;
  snapshot: string;
  exercises: readonly string[];
  tools: ToolDef[];
}): string {
  const actions = manualActionTools(ctx.tools);
  return [
    'You are my strength coach and sports nutritionist, inside a training and diet app. Reply in the language I write in (plan JSON and food names stay in English).',
    '',
    `MY REQUEST: ${ctx.request.trim() || 'Look at how I am doing and tell me what to improve.'}`,
    '',
    `ABOUT ME: ${ctx.profile}`,
    '',
    `MY DATA RIGHT NOW (from the app, metric units; "diet" says if a day was on target, within 10% of the calorie target):`,
    ctx.snapshot,
    '',
    'HOW TO ANSWER:',
    '- If I only ask a question or want your opinion (how am I doing, did I follow my diet today, what should I change), answer in plain text using MY DATA. Do not invent numbers. No JSON.',
    '- If something should change in the app, answer with ONE JSON object in a ```json code block, then at most two short sentences. I will review it before anything is saved. The JSON may contain "workout_plan", "diet_plan" and/or "actions".',
    '',
    formatRules(ctx.exercises),
    '',
    '"actions" is a list of single changes, each { "tool": <name>, "input": { ... } }. Available actions:',
    ...actions.map((t) => `- "${t.name}": ${t.description}\n${fieldLines(t.schema)}`),
    'Example:',
    JSON.stringify({
      actions: [
        { tool: 'log_body', input: { day: '2026-10-13', weight_kg: 81.2 } },
        { tool: 'log_water', input: { ml: 500 } },
      ],
    }),
    `(For plans use "workout_plan" / "diet_plan", like: ${JSON.stringify(Object.keys(FORMAT_EXAMPLE))}.)`,
  ].join('\n');
}

export type ParsedAction = { tool: ToolDef; input: Record<string, unknown> };

/** The `actions` of a pasted answer: only known changing tools, with their input. */
export function parseActions(
  text: string,
  tools: ToolDef[],
): { actions: ParsedAction[]; errors: string[] } {
  const json = extractJson(text);
  if (!json || typeof json !== 'object' || !('actions' in json)) return { actions: [], errors: [] };
  const raw = (json as { actions: unknown }).actions;
  if (!Array.isArray(raw)) return { actions: [], errors: ['"actions" must be a list'] };
  const allowed = manualActionTools(tools);
  const actions: ParsedAction[] = [];
  const errors: string[] = [];
  for (const item of raw.slice(0, 30)) {
    const entry = (item ?? {}) as { tool?: unknown; input?: unknown };
    const tool = allowed.find((t) => t.name === entry.tool);
    if (!tool) {
      errors.push(`Unknown action "${String(entry.tool)}"`);
      continue;
    }
    const input = entry.input && typeof entry.input === 'object' ? entry.input : {};
    actions.push({ tool, input: input as Record<string, unknown> });
  }
  return { actions, errors };
}
