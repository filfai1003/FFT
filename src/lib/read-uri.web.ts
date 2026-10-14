/** Web: fetch reads blob: and http addresses (see read-uri.ts for phones). */
export async function readUri(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(uri)).arrayBuffer());
}
