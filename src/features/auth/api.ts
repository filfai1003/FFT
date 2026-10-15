import type { SupabaseClient } from '@supabase/supabase-js';
import { getMode } from '@/lib/mode';
import { getAuthClient } from '@/lib/supabase';
import { leaveOfflineMode } from './session-store';

export type Credentials = { email: string; password: string };

export const MIN_PASSWORD_LENGTH = 8;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export type CredentialProblem = 'email' | 'password';

export function credentialProblems({ email, password }: Credentials): CredentialProblem[] {
  const problems: CredentialProblem[] = [];
  if (!isValidEmail(email)) problems.push('email');
  if (password.length < MIN_PASSWORD_LENGTH) problems.push('password');
  return problems;
}

export async function signIn({ email, password }: Credentials) {
  const { error } = await getAuthClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  return error?.message ?? null;
}

export async function signUp({ email, password }: Credentials) {
  const { data, error } = await getAuthClient().auth.signUp({ email: email.trim(), password });
  if (error) return { error: error.message, needsConfirmation: false };
  // With e-mail confirmation on, there is a user but no session yet.
  return { error: null, needsConfirmation: data.session == null };
}

export async function signOut() {
  if (getMode() === 'offline') {
    await leaveOfflineMode();
    return;
  }
  await getAuthClient().auth.signOut();
}

/**
 * Forgot password: no email service, so the request reaches the admin panel and the admin emails a
 * temporary password by hand. The answer is the same whether the email has an account or not.
 */
export async function requestPasswordReset(email: string, note: string) {
  const server = getAuthClient() as unknown as SupabaseClient;
  const { error } = await server.rpc('request_password_reset', {
    p_email: email.trim(),
    p_note: note.trim() || null,
  });
  if (error) throw new Error(error.message);
}

/** Changes the password of the signed-in account, after checking the current one. */
export async function changePassword(current: string, next: string) {
  const auth = getAuthClient().auth;
  const { data } = await auth.getUser();
  const email = data.user?.email;
  if (!email) return 'noAccount' as const;
  const check = await auth.signInWithPassword({ email, password: current });
  if (check.error) return 'wrongCurrent' as const;
  const { error } = await auth.updateUser({ password: next });
  return error ? error.message : null;
}
