import type { LocalDb } from './engine';
import { LocalQuery, runRpc } from './query';

type FileBody = ArrayBuffer | Uint8Array | Blob;

async function toBytes(body: FileBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await body.arrayBuffer());
}

/**
 * A stand-in for the Supabase client that keeps everything on the device. It offers the part of
 * the API the app uses: `from()`, `rpc()`, `storage`, `functions` and a minimal `auth`.
 * Nothing leaves the device and there is no sync.
 */
export function createLocalClient(db: LocalDb) {
  const session = { user: { id: db.userId, email: null } };
  return {
    from: (table: string) => new LocalQuery(db, table),
    rpc: (name: string, args: Record<string, unknown> = {}) => runRpc(db, name, args),
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: FileBody, opts?: { contentType?: string }) => {
          await db.ready;
          await db.kv.putFile(
            `${bucket}/${path}`,
            await toBytes(body),
            opts?.contentType ?? 'image/jpeg',
          );
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string, _expiresIn?: number) => {
          await db.ready;
          const url = await db.kv.fileUrl(`${bucket}/${path}`);
          return url
            ? { data: { signedUrl: url }, error: null }
            : { data: null, error: { message: 'File not found' } };
        },
        remove: async (paths: string[]) => {
          for (const p of paths) await db.kv.removeFile(`${bucket}/${p}`);
          return { data: null, error: null };
        },
      }),
    },
    functions: {
      invoke: async (name: string) => {
        if (name === 'delete-account') {
          await db.wipe();
          return { data: { ok: true }, error: null };
        }
        // Online-only helpers (Open Food Facts search): no internet lookups in offline mode.
        return { data: null, error: { message: 'Not available offline' } };
      },
    },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };
}

export type LocalClient = ReturnType<typeof createLocalClient>;
