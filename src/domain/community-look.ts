/**
 * A community member's look (DECISIONS 119): personal colour, frame, title, showcase badge and
 * photo, for Supporter and Premium. The lists are the server's (migration
 * 20261020140000_community_cosmetics.sql): keep them in sync. Titles are a curated list, not free
 * text, so nothing needs moderating; their words live in i18n (`look.titles.<id>`).
 */

export const PROFILE_COLOURS = [
  'ember',
  'amber',
  'lime',
  'forest',
  'ocean',
  'indigo',
  'violet',
  'rose',
] as const;
export type ProfileColour = (typeof PROFILE_COLOURS)[number];

export const FRAMES = ['solid', 'double', 'dashed', 'dotted'] as const;
export type Frame = (typeof FRAMES)[number];

export const TITLES = [
  'beginner',
  'comeback',
  'habit',
  'powerlifter',
  'bodybuilder',
  'weightlifter',
  'strongman',
  'runner',
  'cyclist',
  'swimmer',
  'climber',
  'calisthenics',
  'crossfit',
  'yoga',
  'hiker',
  'home_gym',
  'coach',
  'athlete',
] as const;
export type Title = (typeof TITLES)[number];

/** What others see (null fields = the default). */
export type Look = {
  /**
   * Supporter or Premium (DECISIONS 120): the Supporter badge next to the name. Set by the server
   * from the plan at read time, never by the app.
   */
  supporter?: true;
  colour?: ProfileColour;
  frame?: Frame;
  title?: Title;
  badge?: string;
  /** Path in the public `community-avatars` bucket ("<public_id>/<name>.jpg"). */
  photo?: string;
};

/** The public bucket of community photos. */
export const AVATAR_BUCKET = 'community-avatars';
/** Photos are squared and shrunk to this many pixels before upload (the bucket takes ≤ 256 KB). */
export const AVATAR_SIZE = 384;

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

export const isProfileColour = (v: unknown): v is ProfileColour => isOneOf(PROFILE_COLOURS, v);
export const isFrame = (v: unknown): v is Frame => isOneOf(FRAMES, v);
export const isTitle = (v: unknown): v is Title => isOneOf(TITLES, v);

const PHOTO = /^[0-9a-f-]{36}\/[a-z0-9-]{8,64}\.(jpg|webp)$/;

/**
 * The look from a server answer, keeping only what this app knows (a newer server may add values:
 * they are dropped rather than drawn wrong). Null when nothing is left.
 */
export function cleanLook(raw: unknown): Look | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const look: Look = {};
  if (r.supporter === true) look.supporter = true;
  if (isProfileColour(r.colour)) look.colour = r.colour;
  if (isFrame(r.frame)) look.frame = r.frame;
  if (isTitle(r.title)) look.title = r.title;
  if (typeof r.badge === 'string' && /^[a-z0-9_]{1,40}$/.test(r.badge)) look.badge = r.badge;
  if (typeof r.photo === 'string' && PHOTO.test(r.photo)) look.photo = r.photo;
  return Object.keys(look).length ? look : null;
}

/** Why a member may report a profile photo (DECISIONS 120; the server checks the same list). */
export const REPORT_REASONS = ['nudity', 'violence', 'hateful', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** A new photo's path: the member's folder and a random name (a new name busts every cache). */
export function avatarPath(publicId: string, random: string): string {
  const name = random
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
  return `${publicId}/${name.padEnd(8, '0')}.jpg`;
}
