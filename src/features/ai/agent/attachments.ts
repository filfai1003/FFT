import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { bytesToBase64 } from '@/lib/base64';
import { localFileUrl, readLocalFile, writeLocalFile } from '@/lib/local-db';
import { newId } from '@/lib/uuid';

/**
 * Photos and files added to a coach message. The bytes stay on the device (local file store);
 * the conversation keeps only this description, and the content is read again when sent.
 */
export type Attachment = {
  id: string;
  kind: 'image' | 'pdf' | 'text';
  name: string;
  mime: string;
};

/** What a model receives for an attachment. */
export type LoadedAttachment = Attachment & { base64?: string; text?: string };

const fileKey = (id: string) => `ai-attachments/${id}`;
/** Longest side of a photo sent to the model (larger costs more and adds nothing). */
const MAX_SIDE = 1568;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;
const TEXT_EXT = /\.(txt|csv|tsv|json|md|markdown|xml|ya?ml|log)$/i;

export class AttachmentError extends Error {}

/** A photo taken elsewhere in the app (e.g. a nutrition label), kept like a chat attachment. */
export const attachPhoto = (uri: string, width?: number) => saveImage(uri, width, 'photo.jpg');

async function saveImage(uri: string, width: number | undefined, name: string) {
  const scaled =
    width && width > MAX_SIDE
      ? ImageManipulator.ImageManipulator.manipulate(uri).resize({ width: MAX_SIDE })
      : ImageManipulator.ImageManipulator.manipulate(uri);
  const image = await (
    await scaled.renderAsync()
  ).saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 0.8,
  });
  const bytes = new Uint8Array(await (await fetch(image.uri)).arrayBuffer());
  const a: Attachment = { id: newId(), kind: 'image', name, mime: 'image/jpeg' };
  await writeLocalFile(fileKey(a.id), bytes, a.mime);
  return a;
}

/** A photo from the library (null when cancelled or not allowed). */
export async function pickPhoto(): Promise<Attachment | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  return saveImage(asset.uri, asset.width, asset.fileName ?? 'photo.jpg');
}

/** A file: a picture, a PDF or a text file (CSV, JSON…). Throws AttachmentError for others. */
export async function pickFile(): Promise<Attachment | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset) return null;
  const mime = asset.mimeType ?? '';
  if (mime.startsWith('image/')) return saveImage(asset.uri, undefined, asset.name);

  const bytes = new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
  let a: Attachment;
  if (mime === 'application/pdf' || /\.pdf$/i.test(asset.name)) {
    if (bytes.length > MAX_PDF_BYTES) throw new AttachmentError('too big');
    a = { id: newId(), kind: 'pdf', name: asset.name, mime: 'application/pdf' };
  } else if (mime.startsWith('text/') || mime.includes('json') || TEXT_EXT.test(asset.name)) {
    a = { id: newId(), kind: 'text', name: asset.name, mime: mime || 'text/plain' };
  } else {
    throw new AttachmentError('unsupported');
  }
  await writeLocalFile(fileKey(a.id), bytes, a.mime);
  return a;
}

/** The picture to show in the chat. */
export const attachmentUrl = (a: Attachment) => localFileUrl(fileKey(a.id));

/** The content to send (null when the file is no longer on this device). */
export async function loadAttachment(a: Attachment): Promise<LoadedAttachment | null> {
  const buffer = await readLocalFile(fileKey(a.id));
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  if (a.kind === 'text') {
    const text = new TextDecoder().decode(bytes);
    return {
      ...a,
      text: text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n… [cut]` : text,
    };
  }
  return { ...a, base64: bytesToBase64(bytes) };
}
