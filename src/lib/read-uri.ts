import { File } from 'expo-file-system';

/**
 * The bytes of a file on this phone (a photo just taken, a picked document, a saved file).
 * Read with the file system: fetch() on a file:// address is not reliable on Android (it can fail
 * or come back empty), which is how a label photo once reached the AI as nothing.
 * The web version (read-uri.web.ts) uses fetch, which works there for blob: and http addresses.
 */
export async function readUri(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}
