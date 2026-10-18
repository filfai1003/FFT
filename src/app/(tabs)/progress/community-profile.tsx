import { useLocalSearchParams } from 'expo-router';
import { PublicProfileScreen } from '@/features/community/PublicProfileScreen';

/** A member's community page (`?id=` someone else's public id; none = your own). */
export default function CommunityProfile() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PublicProfileScreen publicId={id || undefined} />;
}
