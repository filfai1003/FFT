import { getMode } from '@/lib/mode';
import { getAuthClient } from '@/lib/supabase';
import { leaveOfflineMode } from './session-store';

// Signing in is with Google only (google.ts); email + password is switched off on the server.

export async function signOut() {
  if (getMode() === 'offline') {
    await leaveOfflineMode();
    return;
  }
  await getAuthClient().auth.signOut();
}
