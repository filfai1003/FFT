import { buildManualPrompt, manualActionTools, parseActions } from './manual';
import type { ToolDef } from './types';

const tool = (name: string, write = true): ToolDef => ({
  name,
  description: `${name} description`,
  schema: { type: 'object', properties: { ml: { type: 'number', description: 'Millilitres' } } },
  write,
  run: async () => ({ content: {} }),
});
const tools = [tool('get_day', false), tool('log_water'), tool('log_body'), tool('propose_plans')];

describe('manual mode (copy and paste)', () => {
  it('the prompt carries the data, the question and every available action', () => {
    const prompt = buildManualPrompt({
      request: 'How am I doing?',
      profile: 'goal maintain',
      snapshot: '{"today":"2026-10-13"}',
      exercises: ['Back squat'],
      tools,
    });
    expect(prompt).toContain('How am I doing?');
    expect(prompt).toContain('{"today":"2026-10-13"}');
    expect(prompt).toContain('"log_water"');
    expect(prompt).toContain('Millilitres');
    expect(prompt).not.toContain('"get_day"'); // reading tools are not actions
    expect(prompt).not.toContain('"propose_plans"'); // plans have their own keys
    expect(prompt).toContain('Back squat');
  });

  it('only changing tools can be asked for; unknown ones are reported', () => {
    expect(manualActionTools(tools).map((t) => t.name)).toEqual(['log_water', 'log_body']);
    const answer =
      'Here:\n```json\n{"actions":[{"tool":"log_water","input":{"ml":500}},{"tool":"get_day","input":{}},{"tool":"drop_everything","input":{}}]}\n```';
    const { actions, errors } = parseActions(answer, tools);
    expect(actions.map((a) => [a.tool.name, a.input])).toEqual([['log_water', { ml: 500 }]]);
    expect(errors).toHaveLength(2);
  });

  it('text without actions, or with plans only, gives no actions and no errors', () => {
    expect(parseActions('You did well today.', tools)).toEqual({ actions: [], errors: [] });
    expect(parseActions('{"workout_plan":{"name":"A","days":[]}}', tools)).toEqual({
      actions: [],
      errors: [],
    });
  });
});
