/**
 * Free accounts keep their data on the device only: the server holds just the account (email and
 * password). Premium is not available yet; when it is, premium users will be the ones whose data
 * is also kept online, and this is the one place that decides it.
 *
 * VIP accounts (made by the admin, see features/profile/vip.ts) are premium whatever the plan; no
 * premium feature exists yet, so this still says false and nobody's data moves.
 */
export function isPremium(): boolean {
  return false;
}
