import { avatarUrl, removeAvatarFile, setAvatar, setPhotoPath } from './avatar-photo';

jest.mock('@/lib/read-uri', () => ({ readUri: jest.fn() }));

const PID = '0f8fad5b-d9cb-469f-a165-70867728950e';

/** A fake storage bucket and RPC, recording what the helper does. */
function fakes({ rpcFails = false } = {}) {
  const calls: string[] = [];
  const upload = jest.fn(async (path: string, body: ArrayBuffer, opts: { contentType: string }) => {
    calls.push(`upload ${path} ${body.byteLength} ${opts.contentType}`);
    return { data: { path }, error: null };
  });
  const remove = jest.fn(async (paths: string[]) => {
    calls.push(`remove ${paths.join(',')}`);
    return { data: [], error: null };
  });
  const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push(`rpc ${name} ${String(args.p_path)}`);
    if (rpcFails) throw new Error('42501');
    return null;
  });
  const storage = () => ({ upload, remove }) as never;
  return {
    calls,
    deps: {
      storage,
      rpc,
      random: () => 'E3B0C442-98FC',
      read: async () => new Uint8Array([1, 2, 3, 4]),
    },
  };
}

describe('community photo upload (DECISIONS 119)', () => {
  it('uploads a JPEG into the member folder, then makes it the photo', async () => {
    const f = fakes();
    const path = await setAvatar(PID, 'file:///photo.jpg', f.deps);
    expect(path).toBe(`${PID}/e3b0c442-98fc.jpg`);
    expect(f.calls).toEqual([
      `upload ${PID}/e3b0c442-98fc.jpg 4 image/jpeg`,
      `rpc community_set_photo ${PID}/e3b0c442-98fc.jpg`,
    ]);
  });

  it('a refused photo (no plan) is removed from storage again', async () => {
    const f = fakes({ rpcFails: true });
    await expect(setAvatar(PID, 'file:///photo.jpg', f.deps)).rejects.toThrow('42501');
    expect(f.calls.at(-1)).toBe(`remove ${PID}/e3b0c442-98fc.jpg`);
  });

  it('removing sets no photo; the old file is deleted on its own', async () => {
    const f = fakes();
    await setPhotoPath(null, f.deps);
    await removeAvatarFile(`${PID}/old12345.jpg`, f.deps);
    await removeAvatarFile(null, f.deps);
    expect(f.calls).toEqual(['rpc community_set_photo null', `remove ${PID}/old12345.jpg`]);
  });

  it('the public address of a photo', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://api.example.test';
    expect(avatarUrl(`${PID}/a1b2c3d4.jpg`)).toBe(
      `https://api.example.test/storage/v1/object/public/community-avatars/${PID}/a1b2c3d4.jpg`,
    );
    expect(avatarUrl(null)).toBeNull();
  });
});
