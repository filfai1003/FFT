import { upstreamBody } from '../../../supabase/functions/ai/upstream';
import { FULL_ACCESS, NO_ACCESS, notSharedCategory } from './access';
import { profileLine } from './context';
import { buildAgentPrompt } from './agent/prompt';
import { toOpenAiMessages } from './agent/provider';
import { AiConsentMissing, runAgent, runTool } from './agent/run';
import type { ToolDef } from './agent/types';

/** DECISIONS 66: the coach sends nothing that identifies the user, and nothing before consent. */

const facts = {
  goal: 'lose_fat',
  sex: 'female',
  birthDate: '1990-05-01',
  heightCm: 168,
  weightKg: 64,
  targetKcal: 1900,
};

describe('anonymisation', () => {
  it('the profile line has the age, never the birth date (and there is no name to give)', () => {
    const line = profileLine(facts, FULL_ACCESS, new Date('2026-10-17'));
    expect(line).toContain('age 36');
    expect(line).not.toContain('1990');
    expect(line).toContain('current target 1900 kcal');
  });

  it('the request to OpenRouter keeps only the message fields, with no user field or ids', () => {
    const body = upstreamBody(
      'm',
      [
        { role: 'system', content: 's', name: 'Mario', user_id: 'u-1' },
        { role: 'user', content: 'hi', metadata: { account: 'a-1' } },
        { role: 'tool', tool_call_id: 'c1', content: '{}' },
      ],
      [],
    );
    expect(body).not.toHaveProperty('user');
    expect(body).not.toHaveProperty('metadata');
    expect(body).not.toHaveProperty('tools');
    expect(body.messages).toEqual([
      { role: 'system', content: 's' },
      { role: 'user', content: 'hi' },
      { role: 'tool', tool_call_id: 'c1', content: '{}' },
    ]);
    expect(body.provider).toEqual({ data_collection: 'deny', zdr: true });
    expect(JSON.stringify(body)).not.toMatch(/Mario|u-1|a-1/);
  });

  it('the built request (system prompt + messages) carries no name, email or birth date', () => {
    const system = buildAgentPrompt({
      today: '2026-10-17',
      profile: profileLine(facts, FULL_ACCESS, new Date('2026-10-17')),
      access: FULL_ACCESS,
    });
    const text = JSON.stringify(
      toOpenAiMessages(system, [{ id: 'u', role: 'user', text: 'How am I doing?' }]),
    );
    expect(text).not.toMatch(/1990-05-01|@|user_id|account/);
  });
});

describe('category gating of the context', () => {
  it('nothing shared: no profile facts, no targets, and the model is told why', () => {
    const line = profileLine(facts, NO_ACCESS);
    expect(line).toBe('not shared by the user');
    const prompt = buildAgentPrompt({ today: '2026-10-17', profile: line, access: NO_ACCESS });
    expect(prompt).toContain('Shared with you: nothing yet');
    expect(prompt).toContain('Not shared: profile and body data');
    expect(prompt).not.toContain('female');
  });

  it('profile without diet: body facts but no calorie target', () => {
    const line = profileLine(facts, { profile: true, diet: false }, new Date('2026-10-17'));
    expect(line).toContain('sex female');
    expect(line).not.toContain('kcal');
    expect(profileLine(facts, { profile: false, diet: true })).toBe('current target 1900 kcal');
  });
});

describe('consent and blocked tools', () => {
  afterEach(() => jest.restoreAllMocks());

  it('nothing is sent before consent', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    await expect(
      runAgent({
        consented: false,
        settings: { provider: 'anthropic', apiKey: 'k', model: 'm', baseUrl: '' },
        system: 's',
        messages: [{ id: 'u', role: 'user', text: 'hi' }],
        tools: [],
        approve: async () => 'approved',
        onMessage: () => undefined,
      }),
    ).rejects.toBeInstanceOf(AiConsentMissing);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a tool of a category not shared neither runs nor asks for approval', async () => {
    const run = jest.fn(async () => ({ content: { secret: 1 } }));
    const approve = jest.fn(async () => 'approved' as const);
    const tool: ToolDef = {
      name: 'log_food',
      description: '',
      schema: {},
      write: true,
      run,
      gate: () => 'diet',
    };
    const r = await runTool({ id: 'c', name: 'log_food', input: {} }, [tool], approve);
    expect(run).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(notSharedCategory(r.content)).toBe('diet');
  });
});
