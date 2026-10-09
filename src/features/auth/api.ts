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

export async function resetPassword(email: string) {
  const { error } = await getAuthClient().auth.resetPasswordForEmail(email.trim());
  return error?.message ?? null;
}

export async function signOut() {
  if (getMode() === 'offline') {
    await leaveOfflineMode();
    return;
  }
  await getAuthClient().auth.signOut();
}
