import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { profilePalette } from '@/design/profile-palette';
import { useTheme } from '@/design/use-theme';
import { canFilterAudience } from '@/domain/community';
import {
  FRAMES,
  PROFILE_COLOURS,
  TITLES,
  isFrame,
  isProfileColour,
  isTitle,
  type Frame,
  type Look,
  type ProfileColour,
  type Title,
} from '@/domain/community-look';
import { badgeCatalogue } from '@/domain/gamification';
import { BadgeDisc, badgeName } from '@/features/gamification/components';
import { useProgressView } from '@/features/gamification/progress-view';
import { tick } from '@/lib/haptics';
import { goBack } from '@/lib/navigation';
import { usePlanStore } from '@/lib/plan';
import { TOAST_DURATION_MS, useToastStore } from '@/lib/toast-store';
import {
  useCommunityAvailable,
  useCommunityMe,
  useSetAvatar,
  useSetCosmetics,
  type CommunityMe,
  type Cosmetics,
} from './api';
import { pickAvatar, removeAvatarFile } from './avatar-photo';
import { LookLine, MemberAvatar } from './MemberAvatar';

/** The member's saved choices (its own values, even while hidden from others). */
function savedOf(me: CommunityMe): Cosmetics {
  return {
    colour: isProfileColour(me.profile_colour) ? me.profile_colour : null,
    frame: isFrame(me.frame) ? me.frame : null,
    title: isTitle(me.title) ? me.title : null,
    badge: me.showcase_badge && me.badges.includes(me.showcase_badge) ? me.showcase_badge : null,
  };
}

const same = (a: Cosmetics, b: Cosmetics) =>
  a.colour === b.colour && a.frame === b.frame && a.title === b.title && a.badge === b.badge;

/**
 * Old photo files wait for the undo toast before they are deleted (the server queued them too, and
 * taking one back takes it off that queue). Kept outside the screen: leaving it does not cancel.
 */
const pendingRemovals = new Map<string, ReturnType<typeof setTimeout>>();
function removeLater(path: string | null | undefined) {
  if (!path) return;
  pendingRemovals.set(
    path,
    setTimeout(() => {
      pendingRemovals.delete(path);
      void removeAvatarFile(path);
    }, TOAST_DURATION_MS + 1000),
  );
}
function keep(path: string | null | undefined) {
  if (!path) return;
  clearTimeout(pendingRemovals.get(path));
  pendingRemovals.delete(path);
}

/**
 * Customize profile (DECISIONS 119): photo, colour, frame, showcase badge and title, as other
 * community members see them. Supporter and Premium choose; free accounts see the same page with
 * the Supporter tag, and every choice opens the Plans page.
 */
export function CustomizeProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const available = useCommunityAvailable();
  const me = useCommunityMe();
  const plan = usePlanStore((s) => s.plan);
  const supporter = canFilterAudience(plan);
  const saveLook = useSetCosmetics();
  const setPhoto = useSetAvatar();
  const showToast = useToastStore((s) => s.show);
  const barHeight = useActionBarHeight();
  const [draft, setDraft] = useState<Cosmetics | null>(null);
  const [busy, setBusy] = useState<'library' | 'camera' | 'remove' | null>(null);

  const back = () => goBack(router, '/profile');
  const toPlans = () => router.push('/profile/premium');
  const header = (
    <>
      <TopBar onBack={back} backLabel={t('common.back')} />
      <Text variant="screenTitle" accessibilityRole="header">
        {t('look.screenTitle')}
      </Text>
    </>
  );

  if (!available || (me.data === null && !me.isPending)) {
    return (
      <Screen scroll bottomBarHeight={24} gap={14}>
        {header}
        <Card gap={10}>
          <Text variant="titleM" semibold>
            {t('look.joinTitle')}
          </Text>
          <Text variant="bodyS" muted>
            {t('look.joinBody')}
          </Text>
          {available ? (
            <Button
              variant="secondary"
              label={t('look.joinCta')}
              onPress={() => {
                useProgressView.getState().setView('community');
                router.push('/progress');
              }}
            />
          ) : null}
        </Card>
      </Screen>
    );
  }

  if (!me.data) {
    return (
      <Screen scroll bottomBarHeight={24} gap={14}>
        {header}
        <SkeletonGroup accessibilityLabel={t('common.loading')}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Skeleton width={96} height={96} round />
            <Skeleton width={160} height={20} />
          </View>
        </SkeletonGroup>
      </Screen>
    );
  }

  const m = me.data;
  const saved = savedOf(m);
  const value = draft ?? saved;
  const set = (patch: Partial<Cosmetics>) => {
    if (!supporter) return toPlans();
    setDraft({ ...value, ...patch });
  };
  const preview: Look = {
    ...(value.colour ? { colour: value.colour } : {}),
    ...(value.frame ? { frame: value.frame } : {}),
    ...(value.title ? { title: value.title } : {}),
    ...(value.badge ? { badge: value.badge } : {}),
    ...(m.photo_path ? { photo: m.photo_path } : {}),
  };
  // The plan ended while choices were set: others see the defaults (hidden, not deleted).
  const hidden = !supporter && m.look == null && (!same(saved, EMPTY) || m.photo_path != null);
  const earned = badgeCatalogue.filter((b) => m.badges.includes(b.id));
  const changed = !same(value, saved);
  const describe = [
    m.name,
    value.title ? t(`look.titles.${value.title}`) : null,
    value.colour ? t(`look.colours.${value.colour}`) : null,
    value.frame ? t(`look.frames.${value.frame}`) : null,
    value.badge ? t('look.badgeA11y', { name: badgeName(t, value.badge) }) : null,
    m.photo_path ? t('look.photo') : null,
  ]
    .filter(Boolean)
    .join(', ');

  const save = async () => {
    const before = saved;
    try {
      await saveLook.mutateAsync(value);
      setDraft(null);
      showToast({
        message: t('look.saved'),
        actionLabel: t('common.undo'),
        onAction: () => void saveLook.mutateAsync(before).catch(() => undefined),
      });
    } catch {
      showToast({ message: t('look.saveFailed') });
    }
  };

  const choosePhoto = async (source: 'library' | 'camera') => {
    if (!supporter) return toPlans();
    setBusy(source);
    try {
      const uri = await pickAvatar(source);
      if (!uri) return;
      const previous = m.photo_path ?? null;
      const path = await setPhoto.mutateAsync({ publicId: m.public_id, localUri: uri });
      removeLater(previous);
      showToast({
        message: t('look.photoSaved'),
        actionLabel: t('common.undo'),
        onAction: () => {
          keep(previous);
          void setPhoto
            .mutateAsync({ publicId: m.public_id, path: previous })
            .then(() => removeAvatarFile(path))
            .catch(() => undefined);
        },
      });
    } catch {
      showToast({ message: t('look.photoFailed') });
    } finally {
      setBusy(null);
    }
  };

  const removePhoto = async () => {
    const previous = m.photo_path ?? null;
    if (!previous) return;
    setBusy('remove');
    try {
      await setPhoto.mutateAsync({ publicId: m.public_id, path: null });
      removeLater(previous);
      showToast({
        message: t('look.photoRemoved'),
        // Putting it back needs the plan (the server refuses otherwise).
        ...(supporter
          ? {
              actionLabel: t('common.undo'),
              onAction: () => {
                keep(previous);
                void setPhoto
                  .mutateAsync({ publicId: m.public_id, path: previous })
                  .catch(() => undefined);
              },
            }
          : {}),
      });
    } catch {
      showToast({ message: t('look.saveFailed') });
    } finally {
      setBusy(null);
    }
  };

  const tag = supporter ? null : <SupporterTag label={t('look.supporterTag')} />;

  return (
    <>
      <Screen scroll bottomBarHeight={supporter ? barHeight + 24 : 24} gap={14}>
        {header}
        <Text variant="bodyS" muted>
          {t('look.intro')}
        </Text>

        <Card gap={10} style={{ alignItems: 'center', paddingVertical: 20 }}>
          <View accessible accessibilityLabel={t('look.previewA11y', { desc: describe })}>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <MemberAvatar name={m.name} look={preview} size={96} />
              <Text variant="titleM" semibold numberOfLines={1}>
                {m.name}
              </Text>
              <LookLine look={preview} />
            </View>
          </View>
        </Card>

        {supporter ? null : (
          <Card gap={10}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="titleM" semibold style={{ flex: 1 }}>
                {t('look.lockedTitle')}
              </Text>
              {tag}
            </View>
            <Text variant="bodyS" muted>
              {t('look.lockedBody')}
            </Text>
            <Button variant="dark" label={t('look.lockedCta')} onPress={toPlans} />
          </Card>
        )}
        {hidden ? (
          <Text variant="bodyS" muted>
            {t('look.hiddenNote')}
          </Text>
        ) : null}

        <Section title={t('look.photo')} tag={tag}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="eye" size={18} color={colors.textMuted} />
            <Text variant="bodyS" muted style={{ flex: 1 }}>
              {t('look.photoPublic')}
            </Text>
          </View>
          <Button
            variant="secondary"
            icon="image"
            label={t('look.choosePhoto')}
            loading={busy === 'library'}
            disabled={busy != null && busy !== 'library'}
            onPress={() => void choosePhoto('library')}
          />
          {Platform.OS === 'web' ? null : (
            <Button
              variant="secondary"
              icon="camera"
              label={t('look.takePhoto')}
              loading={busy === 'camera'}
              disabled={busy != null && busy !== 'camera'}
              onPress={() => void choosePhoto('camera')}
            />
          )}
          {m.photo_path ? (
            <Button
              variant="ghost"
              icon="trash"
              label={t('look.removePhoto')}
              loading={busy === 'remove'}
              disabled={busy != null && busy !== 'remove'}
              onPress={() => void removePhoto()}
            />
          ) : null}
        </Section>

        <Section title={t('look.colour')} tag={tag}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {([null, ...PROFILE_COLOURS] as (ProfileColour | null)[]).map((c) => (
              <Swatch
                key={c ?? 'none'}
                colour={c}
                label={t(`look.colours.${c ?? 'none'}`)}
                selected={value.colour === c}
                onPress={() => set({ colour: c })}
              />
            ))}
          </View>
        </Section>

        <Section title={t('look.frame')} tag={tag}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {([null, ...FRAMES] as (Frame | null)[]).map((f) => (
              <Option
                key={f ?? 'none'}
                label={t(`look.frames.${f ?? 'none'}`)}
                selected={value.frame === f}
                onPress={() => set({ frame: f })}
              >
                <MemberAvatar
                  name={m.name}
                  size={44}
                  look={{
                    ...(value.colour ? { colour: value.colour } : {}),
                    ...(f ? { frame: f } : {}),
                  }}
                />
              </Option>
            ))}
          </View>
        </Section>

        <Section title={t('look.badge')} info={t('look.badgeInfo')} tag={tag}>
          {earned.length === 0 ? (
            <Text variant="bodyS" muted>
              {t('look.noBadges')}
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Option
                label={t('look.badgeNone')}
                selected={value.badge === null}
                onPress={() => set({ badge: null })}
              >
                <Icon name="close" size={20} color={colors.textMuted} />
              </Option>
              {earned.map((b) => (
                <Option
                  key={b.id}
                  label={badgeName(t, b.id)}
                  selected={value.badge === b.id}
                  onPress={() => set({ badge: b.id })}
                >
                  <BadgeDisc badge={b} size={36} />
                </Option>
              ))}
            </View>
          )}
        </Section>

        <Section title={t('look.title')} info={t('look.titleInfo')} tag={tag}>
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
          >
            {([null, ...TITLES] as (Title | null)[]).map((ti) => (
              <Chip
                key={ti ?? 'none'}
                role="radio"
                label={ti ? t(`look.titles.${ti}`) : t('look.titleNone')}
                selected={value.title === ti}
                onPress={() => set({ title: ti })}
              />
            ))}
          </View>
        </Section>
      </Screen>
      {supporter ? (
        <BottomActionBar>
          <Button
            size="large"
            label={t('look.save')}
            disabled={!changed || saveLook.isPending}
            loading={saveLook.isPending}
            onPress={() => void save()}
          />
        </BottomActionBar>
      ) : null}
    </>
  );
}

const EMPTY: Cosmetics = { colour: null, frame: null, title: null, badge: null };

function Section({
  title,
  info,
  tag,
  children,
}: {
  title: string;
  info?: string;
  tag?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card gap={12}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="body" semibold accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </Text>
          {tag}
        </View>
        {info ? (
          <Text variant="bodyS" muted>
            {info}
          </Text>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

/** The Supporter tag, as on the community filters (star and word, never colour alone). */
function SupporterTag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        minHeight: 24,
        paddingHorizontal: 8,
        borderRadius: 12,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <Icon name="star" size={12} color={colors.textMuted} />
      <Text variant="label" semibold style={{ color: colors.textMuted }}>
        {label}
      </Text>
    </View>
  );
}

/** A choice drawn as a picture (frame, badge): 2px border in the text colour when chosen. */
function Option({
  label,
  selected,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={() => {
        tick();
        onPress();
      }}
      style={{ alignItems: 'center', gap: 4, width: 72 }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.borderSelected : colors.borderDecorative,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
      <Text variant="label" muted={!selected} semibold={selected} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A colour swatch: the disc in the colour, a check and the 2px border when chosen. */
function Swatch({
  colour,
  label,
  selected,
  onPress,
}: {
  colour: ProfileColour | null;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, mode } = useTheme();
  const s = colour ? profilePalette[mode][colour] : null;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={() => {
        tick();
        onPress();
      }}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 2,
        borderColor: selected ? colors.borderSelected : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: s?.fill ?? colors.surface,
          borderWidth: 3,
          borderColor: s?.ring ?? colors.borderControl,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <Icon name="check" size={18} color={s?.ink ?? colors.text} />
        ) : !s ? (
          <Icon name="close" size={16} color={colors.textMuted} />
        ) : null}
      </View>
    </Pressable>
  );
}
