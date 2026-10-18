import { Redirect } from 'expo-router';

/**
 * Old address of Privacy: consents, export and delete account (what the policies and the server's
 * messages point to) are on Your data now (DECISIONS 102).
 */
export default function Privacy() {
  return <Redirect href="/profile/data" />;
}
