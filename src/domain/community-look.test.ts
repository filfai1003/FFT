import fs from 'node:fs';
import path from 'node:path';
import { avatarPath, cleanLook, FRAMES, PROFILE_COLOURS, TITLES } from './community-look';

const PID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('community look (DECISIONS 119)', () => {
  it('keeps only known values from the server', () => {
    expect(cleanLook(null)).toBeNull();
    expect(cleanLook({})).toBeNull();
    expect(
      cleanLook({
        colour: 'ocean',
        frame: 'double',
        title: 'runner',
        badge: 'first_workout',
        photo: `${PID}/abcdef12.jpg`,
      }),
    ).toEqual({
      colour: 'ocean',
      frame: 'double',
      title: 'runner',
      badge: 'first_workout',
      photo: `${PID}/abcdef12.jpg`,
    });
    // A newer server's values are dropped rather than drawn wrong.
    expect(
      cleanLook({ colour: 'neon', frame: 'glow', title: 'Best ever', photo: '../x.png' }),
    ).toBe(null);
    expect(cleanLook({ colour: 'rose', badge: 'Bad Badge' })).toEqual({ colour: 'rose' });
  });

  it('a new photo goes in the member folder with a fresh name', () => {
    const p = avatarPath(PID, 'E3B0C442-98FC-1C14-9AFB-F4C8996FB924');
    expect(p).toBe(`${PID}/e3b0c442-98fc-1c14-9afb-f4c8996fb924.jpg`);
    expect(cleanLook({ photo: p })).toEqual({ photo: p });
    expect(avatarPath(PID, 'ab')).toBe(`${PID}/ab000000.jpg`);
  });

  it('the lists are the server’s', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../supabase/migrations/20261020140000_community_cosmetics.sql'),
      'utf8',
    );
    for (const v of [...PROFILE_COLOURS, ...FRAMES, ...TITLES]) expect(sql).toContain(`'${v}'`);
    expect(TITLES.every((t) => t.length <= 24)).toBe(true);
  });
});
