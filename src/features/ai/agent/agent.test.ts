import { optNum, str, day } from './args';
import { toAnthropicMessages, toOpenAiMessages, recentMessages } from './provider';
import { repairMessages, runAgent, runTool, canUndo, undoCall } from './run';
import type { AgentMessage, ToolDef } from './types';

const settings = { provider: 'anthropic', apiKey: 'k', model: 'm', baseUrl: '' } as const;

const toolMessages: AgentMessage[] = [
  { id: '1', role: 'user', text: 'weigh in' },
  {
    id: '2',
    role: 'assistant',
    text: 'Logging.',
    toolCalls: [{ id: 'c1', name: 'log_body', input: { weight_kg: 82 } }],
  },
  { id: '3', role: 'tool', results: [{ callId: 'c1', content: '{"ok":true}', outcome: 'done' }] },
];

describe('tool arguments', () => {
  it('accepts numbers and decimal commas, rejects out of range and text', () => {
    expect(optNum({ w: '82,5' }, 'w', 20, 400)).toBe(82.5);
    expect(optNum({}, 'w', 20, 400)).toBeUndefined();
    expect(() => optNum({ w: 5 }, 'w', 20, 400)).toThrow(/between/);
    expect(() => optNum({ w: 'abc' }, 'w', 20, 400)).toThrow(/number/);
    expect(() => str({}, 'name')).toThrow(/required/);
    expect(day({}, 'day', '2026-10-13')).toBe('2026-10-13');
    expect(() => day({ day: '13/10/2026' }, 'day', 'x')).toThrow(/date/);
    expect(() => day({ day: '2026-13-45' }, 'day', 'x')).toThrow(/date/);
  });
});

describe('provider formats', () => {
  it('Anthropic: tool calls are tool_use blocks, results are tool_result blocks of a user turn', () => {
    const out = toAnthropicMessages(toolMessages);
    expect(out[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Logging.' },
        { type: 'tool_use', id: 'c1', name: 'log_body', input: { weight_kg: 82 } },
      ],
    });
    expect(out[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"ok":true}' }],
    });
  });

  it('OpenAI: tool_calls on the assistant, one tool message per result', () => {
    const out = toOpenAiMessages('sys', toolMessages);
    expect(out[0]).toEqual({ role: 'system', content: 'sys' });
    expect(out[2]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'c1', function: { name: 'log_body', arguments: '{"weight_kg":82}' } }],
    });
    expect(out[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' });
  });

  it('long conversations are cut at a user message, never between a call and its result', () => {
    const many: AgentMessage[] = [];
    for (let i = 0; i < 40; i++)
      many.push(...toolMessages.map((m) => ({ ...m, id: `${i}-${m.id}` })));
    const out = recentMessages(many);
    expect(out[0].role).toBe('user');
    expect(out.length).toBeLessThanOrEqual(60);
  });
});

describe('closing interrupted conversations', () => {
  it('a call without a result gets a cancelled one', () => {
    const cut = toolMessages.slice(0, 2);
    const fixed = repairMessages(cut);
    expect(fixed).toHaveLength(3);
    expect(fixed[2]).toMatchObject({
      role: 'tool',
      results: [{ callId: 'c1', outcome: 'cancelled' }],
    });
    expect(repairMessages(toolMessages)).toEqual(toolMessages);
  });
});

function reply(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('the agent loop', () => {
  const read: ToolDef = {
    name: 'get_x',
    description: '',
    schema: { type: 'object' },
    run: async () => ({ content: { x: 1 } }),
  };
  const undo = jest.fn(async () => undefined);
  const write: ToolDef = {
    name: 'set_y',
    description: '',
    schema: { type: 'object' },
    write: true,
    run: async () => ({ content: { saved: true }, undo }),
  };

  afterEach(() => jest.restoreAllMocks());

  it('reads run at once; a refused change is not run and the model is told', async () => {
    const run = jest.spyOn(write, 'run');
    const replies = [
      reply({
        content: [
          { type: 'tool_use', id: 'a1', name: 'get_x', input: {} },
          { type: 'tool_use', id: 'a2', name: 'set_y', input: {} },
        ],
      }),
      reply({ content: [{ type: 'text', text: 'Fine, not changing it.' }] }),
    ];
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => replies.shift()!);
    const seen: AgentMessage[] = [];
    await runAgent({
      settings,
      system: 's',
      messages: [{ id: 'u', role: 'user', text: 'hi' }],
      tools: [read, write],
      approve: async () => 'rejected',
      onMessage: (m) => seen.push(m),
    });
    expect(run).not.toHaveBeenCalled();
    expect(seen.map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant']);
    const results = (seen[1] as Extract<AgentMessage, { role: 'tool' }>).results;
    expect(results.map((r) => r.outcome)).toEqual(['done', 'rejected']);
    // the second request carries the tool results
    const second = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(second.messages.at(-1).content.map((c: { type: string }) => c.type)).toEqual([
      'tool_result',
      'tool_result',
    ]);
  });

  it('an approved change runs and can be undone; an unknown tool or a failure is an error result', async () => {
    const approved = await runTool(
      { id: 'w1', name: 'set_y', input: {} },
      [write],
      async () => 'approved',
    );
    expect(approved.outcome).toBe('done');
    expect(canUndo('w1')).toBe(true);
    await undoCall('w1');
    expect(undo).toHaveBeenCalledTimes(1);
    expect(canUndo('w1')).toBe(false);

    expect(
      (await runTool({ id: 'x', name: 'nope', input: {} }, [], async () => 'approved')).outcome,
    ).toBe('error');
    const failing: ToolDef = {
      ...read,
      run: async () => {
        throw new Error('bad value');
      },
    };
    const failed = await runTool(
      { id: 'f', name: 'get_x', input: {} },
      [failing],
      async () => 'approved',
    );
    expect(failed).toMatchObject({ outcome: 'error' });
    expect(failed.content).toContain('bad value');
  });
});
