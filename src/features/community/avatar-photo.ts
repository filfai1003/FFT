import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { AVATAR_BUCKET, AVATAR_SIZE, avatarPath } from '@/domain/community-look';
import { readUri } from '@/lib/read-uri';
import { getAuthClient } from '@/lib/supabase';

/**
 * The community photo (DECISIONS 119): picked from the gallery or taken with the camera, cropped
 * square, shrunk to 384 px JPEG (tens of KB; the bucket refuses more than 256 KB or another type)
 * and uploaded to the PUBLIC bucket `community-avatars` under the member's public id (never the
 * account id). Like the rest of the community it lives on the server only, through the account
 * client, never the device database.
 */
const server = () => getAuthClient() as unknown as SupabaseClient;

/** Where anyone can load a photo (public bucket; the random file name changes with each photo). */
export function avatarUrl(path: string | null | undefined): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

/** Squares (centre crop) and shrinks a picked image; returns the local JPEG. */
export async function squareJpeg(
  uri: string,
  width: number | undefined,
  height: number | undefined,
): Promise<string> {
  let ctx = ImageManipulator.ImageManipulator.manipulate(uri);
  if (width && height && width !== height) {
    const side = Math.min(width, height);
    ctx = ctx.crop({
      originX: Math.floor((width - side) / 2),
      originY: Math.floor((height - side) / 2),
      width: side,
      height: side,
    });
  }
  const image = await ctx.resize({ width: AVATAR_SIZE, height: AVATAR_SIZE }).renderAsync();
  const saved = await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/**
 * Lets the member choose a photo: 'library' opens the system photo picker (no permission needed),
 * 'camera' asks for the camera. Null when cancelled or not allowed.
 */
export async function pickAvatar(source: 'library' | 'camera'): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return squareJpeg(asset.uri, asset.width, asset.height);
}

type Storage = Pick<ReturnType<SupabaseClient['storage']['from']>, 'upload' | 'remove'>;
type Deps = {
  storage?: () => Storage;
  rpc?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  random?: () => string;
  read?: (uri: string) => Promise<Uint8Array>;
};
const defaults = {
  storage: (): Storage => server().storage.from(AVATAR_BUCKET),
  rpc: async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await server().rpc(name, args);
    if (error) throw error;
    return data;
  },
  random: () => Crypto.randomUUID(),
  read: readUri,
};

/**
 * Uploads a new photo and makes it the member's (community_set_photo); if the server refuses it,
 * the file just uploaded is removed again. Returns the new path. The previous file is NOT removed
 * here: the caller removes it once the undo toast is gone (`removeAvatarFile`); the server has
 * queued it for removal anyway, and taking it back (undo) takes it off that queue.
 */
export async function setAvatar(
  publicId: string,
  localUri: string,
  deps: Deps = {},
): Promise<string> {
  const d = { ...defaults, ...deps };
  const path = avatarPath(publicId, d.random());
  const bytes = await d.read(localUri);
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const { error } = await d
    .storage()
    .upload(path, body, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
  if (error) throw error;
  try {
    await d.rpc('community_set_photo', { p_path: path });
  } catch (e) {
    await d
      .storage()
      .remove([path])
      .catch(() => undefined);
    throw e;
  }
  return path;
}

/** Puts back a photo still in storage (undo), or none (null: others see the initial again). */
export async function setPhotoPath(path: string | null, deps: Deps = {}) {
  const d = { ...defaults, ...deps };
  await d.rpc('community_set_photo', { p_path: path });
}

/** Deletes a photo's file now (best effort: the server's queue removes it otherwise). */
export async function removeAvatarFile(path: string | null | undefined, deps: Deps = {}) {
  if (!path) return;
  const d = { ...defaults, ...deps };
  await d
    .storage()
    .remove([path])
    .catch(() => undefined);
}
