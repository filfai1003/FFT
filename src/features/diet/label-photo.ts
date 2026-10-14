import { LABEL_PROMPT, parseLabelReply, type LabelValues } from '@/domain/label';
import { photoForModel } from '@/features/ai/agent/attachments';
import { callModel } from '@/features/ai/agent/provider';
import type { AiSettings } from '@/features/ai/settings-store';
import { newId } from '@/lib/uuid';

/**
 * "Fill from a photo of the label" in New food: the photo (taken with the app's camera,
 * CameraModal) goes to the AI coach's model, which reads the nutrition table; the form is filled
 * with what it found. Nothing is saved until the user taps Save, so every value can be checked.
 */

/** The label's values, or null when the photo could not be read as a nutrition label. */
export async function readLabel(
  photo: { uri: string; width?: number },
  settings: AiSettings,
): Promise<LabelValues | null> {
  const image = await photoForModel(photo.uri, photo.width);
  const { base64: _bytes, ...attachment } = image;
  const reply = await callModel(
    settings,
    LABEL_PROMPT,
    [{ id: newId(), role: 'user', text: 'Read this label.', attachments: [attachment] }],
    [],
    undefined,
    new Map([[image.id, image]]),
  );
  return parseLabelReply(reply.text);
}
