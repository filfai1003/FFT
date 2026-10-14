import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { LABEL_PROMPT, parseLabelReply, type LabelValues } from '@/domain/label';
import { attachPhoto } from '@/features/ai/agent/attachments';
import { callModel } from '@/features/ai/agent/provider';
import type { AiSettings } from '@/features/ai/settings-store';
import { newId } from '@/lib/uuid';

/**
 * "Fill from a photo of the label" in New food: the camera (the photo library on the web), then the
 * AI coach's model reads the nutrition table and the form is filled with what it found. Nothing is
 * saved until the user taps Save, so every value can be checked first.
 */

/** A photo of the label (null when cancelled or not allowed). */
export async function photographLabel(): Promise<{ uri: string; width?: number } | null> {
  const camera = Platform.OS !== 'web';
  const permission = camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const res = camera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  const asset = res.canceled ? null : res.assets[0];
  return asset ? { uri: asset.uri, width: asset.width } : null;
}

/** The label's values, or null when the photo could not be read as a nutrition label. */
export async function readLabel(
  photo: { uri: string; width?: number },
  settings: AiSettings,
): Promise<LabelValues | null> {
  const attachment = await attachPhoto(photo.uri, photo.width);
  const reply = await callModel(
    settings,
    LABEL_PROMPT,
    [{ id: newId(), role: 'user', text: 'Read this label.', attachments: [attachment] }],
    [],
  );
  return parseLabelReply(reply.text);
}
