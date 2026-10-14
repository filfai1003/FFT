import { useQuery } from '@tanstack/react-query';
import { ExerciseImage } from '@/components/ui/ExerciseImage';
import { Asset } from 'expo-asset';
import { catalogueImages } from '@/lib/local-db/catalogue';
import { getMode } from '@/lib/mode';
import { getSupabase } from '@/lib/supabase';
import { exerciseImageUrl, type Exercise } from './exercises';

type ImageSource = Pick<Exercise, 'ownerId' | 'imagePath'>;

const SIGNED_URL_TTL_S = 60 * 60;

/**
 * Where to load an exercise image from: catalogue images are public, the user's own images live
 * in a private bucket and need a signed URL.
 */
export function useExerciseImageUri(e: ImageSource | null | undefined): string | null {
  const path = e?.imagePath ?? null;
  const own = e?.ownerId != null;
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

  const signed = useQuery({
    queryKey: ['exercise-image', path],
    enabled: own && path != null,
    staleTime: (SIGNED_URL_TTL_S - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .storage.from('user-exercise-images')
        .createSignedUrl(path!, SIGNED_URL_TTL_S);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (!path) return null;
  if (own) return signed.data ?? null;
  // Catalogue images ship with the app; the server's public copy is only a fallback.
  const asset = catalogueImages[path];
  if (asset) return Asset.fromModule(asset).uri;
  return getMode() === 'cloud' && base ? exerciseImageUrl(base, path) : null;
}

/** The generic picture (same style as the catalogue) for exercises without their own image. */
const fallback = catalogueImages['default.png'];

export function ExerciseThumb({ exercise, size }: { exercise: ImageSource; size?: number }) {
  const uri = useExerciseImageUri(exercise);
  return (
    <ExerciseImage uri={uri ?? (fallback ? Asset.fromModule(fallback).uri : null)} size={size} />
  );
}
