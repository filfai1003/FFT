import { isThisComputer, newConnections, splitTokens, unseenConnections } from './connections';

const day = 86400000;
const now = Date.parse('2026-10-18T12:00:00Z');
const at = (daysAgo: number) => new Date(now - daysAgo * day).toISOString();

describe('connected AI apps', () => {
  const rows = [
    { id: 'claude', app: true, createdAt: at(1) },
    { id: 'mine', app: false, createdAt: at(0) },
    { id: 'chatgpt', app: true, createdAt: at(20) },
  ];

  it('separates personal tokens from connected apps', () => {
    const { tokens, apps } = splitTokens(rows);
    expect(tokens.map((r) => r.id)).toEqual(['mine']);
    expect(apps.map((r) => r.id)).toEqual(['claude', 'chatgpt']);
  });

  it('points out only the apps connected in the last 7 days', () => {
    expect(newConnections(rows, now).map((r) => r.id)).toEqual(['claude']);
    expect(newConnections([{ app: true, createdAt: at(7) }], now)).toHaveLength(1);
    expect(newConnections([{ app: true, createdAt: at(7.01) }], now)).toHaveLength(0);
  });

  it('at start, points out once the apps connected since the last start (DECISIONS 99)', () => {
    expect(unseenConnections(rows, null, now).map((r) => r.id)).toEqual(['claude']);
    expect(unseenConnections(rows, at(2), now).map((r) => r.id)).toEqual(['claude']);
    expect(unseenConnections(rows, at(0.5), now)).toHaveLength(0);
  });

  it('names a sign-in that went to this computer', () => {
    expect(isThisComputer('127.0.0.1')).toBe(true);
    expect(isThisComputer('localhost')).toBe(true);
    expect(isThisComputer('claude.ai')).toBe(false);
    expect(isThisComputer(null)).toBe(false);
  });
});
