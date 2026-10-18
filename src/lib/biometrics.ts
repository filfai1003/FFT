import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Asks for Face ID / fingerprint / device code. Resolves true when the user passes, or when the
 * device has nothing to authenticate with (the lock then cannot be enforced).
 */
export async function authenticate(reason: string): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHardware && (await LocalAuthentication.isEnrolledAsync());
    if (!enrolled) return true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

/** The device has a fingerprint, face or screen lock (PIN, pattern, password) set up. */
export async function canAuthenticate(): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** Errors that mean the device has no lock any more: the app lock lets the user in (95). */
const NO_LOCK = new Set(['not_enrolled', 'not_available', 'passcode_not_set']);

/**
 * The app lock (DECISIONS 95): fingerprint, face or the device code. 'passed' also when the device
 * no longer has any lock (it was removed in the phone's settings): the lock must never keep the
 * owner out of their own data. 'failed' when cancelled or wrong: the lock screen stays, with a
 * button to try again.
 */
export async function unlockApp(reason: string): Promise<'passed' | 'failed'> {
  try {
    if (!(await canAuthenticate())) return 'passed';
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      disableDeviceFallback: false,
    });
    if (result.success) return 'passed';
    return NO_LOCK.has(result.error) ? 'passed' : 'failed';
  } catch {
    return 'failed';
  }
}
