/**
 * Connected AI apps (OAuth, DECISIONS 74) next to personal tokens: both are api_tokens rows, a
 * connection has the app's client id and the host its sign-in went back to.
 */

/** When this device last pointed out new AI app connections of an account (AsyncStorage). */
export const connectionsSeenKeyOf = (userId: string) => `fft.connections-seen.${userId}`;

/** A connection made in the last days is pointed out at the top of API & MCP. */
export const NEW_CONNECTION_DAYS = 7;

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/** The sign-in went to a program on the user's computer (a desktop app, Claude Code). */
export const isThisComputer = (host: string | null) => host != null && LOOPBACK.includes(host);

type Row = { app: boolean; createdAt: string };

/** Personal tokens and connected apps, each in the order given. */
export function splitTokens<T extends Row>(rows: readonly T[]): { tokens: T[]; apps: T[] } {
  return { tokens: rows.filter((r) => !r.app), apps: rows.filter((r) => r.app) };
}

/** The connected apps made in the last NEW_CONNECTION_DAYS days. */
export function newConnections<T extends Row>(apps: readonly T[], now = Date.now()): T[] {
  const since = now - NEW_CONNECTION_DAYS * 86400000;
  return apps.filter((a) => a.app && new Date(a.createdAt).getTime() >= since);
}

/**
 * Connected apps made after the last time the app pointed them out (`seenAt`, ISO time; none yet:
 * the last NEW_CONNECTION_DAYS days). Shown once at the next app start (DECISIONS 99).
 */
export function unseenConnections<T extends Row>(
  apps: readonly T[],
  seenAt: string | null,
  now = Date.now(),
): T[] {
  const since = seenAt ? Date.parse(seenAt) : now - NEW_CONNECTION_DAYS * 86400000;
  return apps.filter((a) => a.app && new Date(a.createdAt).getTime() > since);
}
