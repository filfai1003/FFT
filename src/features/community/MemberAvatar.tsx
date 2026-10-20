import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { profilePalette } from '@/design/profile-palette';
import { useTheme } from '@/design/use-theme';
import { badgeCatalogue } from '@/domain/gamification';
import type { Frame, Look } from '@/domain/community-look';
import { BadgeDisc, badgeName } from '@/features/gamification/components';
import { avatarUrl } from './avatar-photo';

/** Width of the frame's stroke for an avatar of this size. */
export const frameWidth = (size: number) => Math.max(2, Math.round(size / 16));

/**
 * A member's avatar (DECISIONS 119): the photo, or the initial on the member's colour (the neutral
 * disc without one), inside its frame. `ring` = the old 3px ring in the text colour (you, first
 * place) when the member has no frame of its own. Decoration only: the name is always next to it.
 */
export function MemberAvatar({
  name,
  look,
  size = 34,
  ring = false,
  photoUri,
}: {
  name: string;
  look?: Look | null;
  size?: number;
  ring?: boolean;
  /** A local picture to show instead of the stored one (the Customize page's preview). */
  photoUri?: string | null;
}) {
  const { colors, mode } = useTheme();
  const swatch = look?.colour ? profilePalette[mode][look.colour] : null;
  const frame: Frame | null = look?.frame ?? (ring ? 'solid' : null);
  const stroke = frameWidth(size);
  const inset = frame ? (frame === 'double' ? stroke * 2 + 1 : stroke + 1) : 0;
  const inner = size - inset * 2;
  const uri = photoUri ?? avatarUrl(look?.photo);
  const frameColour = swatch?.ring ?? colors.borderSelected;
  return (
    <View
      aria-hidden
      testID="member-avatar"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {frame ? <FrameRing frame={frame} size={size} stroke={stroke} color={frameColour} /> : null}
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          overflow: 'hidden',
          backgroundColor: swatch?.fill ?? colors.borderDecorative,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {uri ? (
          <Image
            testID="member-avatar-photo"
            source={{ uri }}
            style={{ width: inner, height: inner }}
            contentFit="cover"
            cachePolicy="disk"
            transition={0}
          />
        ) : (
          <Text
            semibold
            style={{
              fontSize: Math.max(12, Math.round(inner * 0.42)),
              lineHeight: Math.max(16, Math.round(inner * 0.52)),
              color: swatch?.ink ?? colors.text,
            }}
          >
            {(name.trim()[0] ?? '?').toUpperCase()}
          </Text>
        )}
      </View>
    </View>
  );
}

/** The frame: one ring, two thin rings, dashes or dots, in the member's colour. */
function FrameRing({
  frame,
  size,
  stroke,
  color,
}: {
  frame: Frame;
  size: number;
  stroke: number;
  color: string;
}) {
  const c = size / 2;
  const r = c - stroke / 2;
  const circ = 2 * Math.PI * r;
  return (
    <Svg
      testID={`member-avatar-frame-${frame}`}
      width={size}
      height={size}
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {frame === 'double' ? (
        <>
          <Circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke * 0.7} />
          <Circle
            cx={c}
            cy={c}
            r={r - stroke * 1.2}
            fill="none"
            stroke={color}
            strokeWidth={stroke * 0.6}
          />
        </>
      ) : (
        <Circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap={frame === 'dotted' ? 'round' : 'butt'}
          strokeDasharray={
            frame === 'dashed'
              ? `${circ / 16} ${circ / 32}`
              : frame === 'dotted'
                ? `0.01 ${circ / 18}`
                : undefined
          }
        />
      )}
    </Svg>
  );
}

/** What the look adds to a row's spoken label: ", Runner, badge First workout" (or nothing). */
export function useLookA11y() {
  const { t } = useTranslation();
  return (look: Look | null | undefined): string => {
    const parts = [
      look?.title ? t(`look.titles.${look.title}`) : null,
      look?.badge ? t('look.badgeA11y', { name: badgeName(t, look.badge) }) : null,
    ].filter(Boolean);
    return parts.length ? `, ${parts.join(', ')}` : '';
  };
}

/**
 * The showcase badge and the title next to a member's name ("🏅 Runner"), or nothing. Read out as
 * words: the badge's name and the title.
 */
export function LookLine({ look, size = 18 }: { look?: Look | null; size?: number }) {
  const { t } = useTranslation();
  const badge = look?.badge ? badgeCatalogue.find((b) => b.id === look.badge) : undefined;
  const title = look?.title ? t(`look.titles.${look.title}`) : null;
  if (!badge && !title) return null;
  const label = [title, badge ? t('look.badgeA11y', { name: badgeName(t, badge.id) }) : null]
    .filter(Boolean)
    .join(', ');
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}
    >
      {badge ? <BadgeDisc badge={badge} size={size} /> : null}
      {title ? (
        <Text variant="label" muted numberOfLines={1} style={{ flexShrink: 1 }}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}
