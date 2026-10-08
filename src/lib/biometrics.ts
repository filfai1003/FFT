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
