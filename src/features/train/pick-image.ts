import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { getSupabase } from '@/lib/supabase';

/**
 * Lets the user pick a photo from the library, squares and shrinks it, and returns the local URI
 * (or null if cancelled / not allowed).
 */
export async function pickSquareImage(size = 512): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  const resized = await ImageManipulator.ImageManipulator.manipulate(result.assets[0].uri)
    .resize({ width: size, height: size })
    .renderAsync();
  const saved = await resized.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 0.85,
  });
  return saved.uri;
}

/** Uploads a local image to a private bucket under "<userId>/<name>" and returns the path. */
export async function uploadPrivateImage(
  bucket: 'user-exercise-images' | 'progress-photos',
  userId: string,
  name: string,
  localUri: string,
): Promise<string> {
  const path = `${userId}/${name}`;
  const body = await (await fetch(localUri)).arrayBuffer();
  const { error } = await getSupabase()
    .storage.from(bucket)
    .upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}
