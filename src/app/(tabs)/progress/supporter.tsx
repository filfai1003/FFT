import { Redirect } from 'expo-router';

/** Old address of the Supporter page: the tiers are on the one Plans page now (DECISIONS 100). */
export default function Supporter() {
  return <Redirect href="/profile/premium" />;
}
