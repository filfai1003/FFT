import { usePhotoScreenPrivacy } from '@/features/profile/screen-privacy';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonGroup } from '@/components/ui/Skeleton';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel } from '@/domain/day';
import { displayLength, displayWeight } from '@/domain/units';
import { useProfile } from '@/features/profile/api';
import { usePrivacyStore } from '@/features/profile/privacy-store';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { authenticate } from '@/lib/biometrics';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import {
  poses,
  useBodyEntries,
  useBodyGoal,
  useDeletePhoto,
  usePhotos,
  usePhotoUrl,
  type BodyEntry,
  type Photo,
  type Pose,
} from './data';
import { PhotoTile } from './PhotoTile';
import { signed } from './ProgressScreen';
import { changeArea } from './series';

const infoFor = (e: BodyEntry | undefined, unit: 'kg' | 'lb') =>
  e
    ? [
        e.weightKg != null ? `${displayWeight(e.weightKg, unit)} ${unit}` : null,
        e.bodyFatPct != null ? `${e.bodyFatPct}%` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

/** Progress photos by check-in: private, blurred until tapped. */
export function PhotosScreen() {
  // Kept out of screenshots and recent apps (DECISIONS 95).
  usePhotoScreenPrivacy();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const photos = usePhotos();
  const entries = useBodyEntries();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const [pose, setPose] = useState<Pose | 'all'>('all');
  // The check-in whose photos are being deleted (a sheet lists them, one button each).
  const [deleting, setDeleting] = useState<string | null>(null);
  const remove = useDeletePhoto();
  const showToast = useToastStore((s) => s.show);

  const days = [...new Set((photos.data ?? []).map((p) => p.day))];
  const shown: Pose[] = pose === 'all' ? poses : [pose];
  const toDelete = (photos.data ?? []).filter((p) => p.day === deleting);

  const deletePhoto = (photo: Photo) =>
    remove.mutate(
      { id: photo.id, deleted: true },
      {
        onSuccess: () => {
          if (toDelete.length <= 1) setDeleting(null);
          showToast({
            message: t('photos.deleted', {
              pose: t(`photos.pose.${photo.pose}`),
              date: shortDateLabel(photo.day),
            }),
            actionLabel: t('common.undo'),
            onAction: () => remove.mutate({ id: photo.id, deleted: false }),
          });
        },
      },
    );

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar
        onBack={() => goBack(router, '/progress')}
        backLabel={t('common.back')}
        right={
          <IconButton
            icon="plus"
            accessibilityLabel={t('photos.add')}
            onPress={() => router.push('/check-in')}
          />
        }
      />
      <View style={{ gap: 6 }}>
        <Text variant="screenTitle">{t('photos.title')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="lock" size={14} color={colors.textMuted} />
          <Text variant="bodyS" muted style={{ flex: 1 }}>
            {t('photos.private')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(['all', ...poses] as const).map((p) => (
          <Chip
            key={p}
            role="radio"
            label={t(p === 'all' ? 'photos.all' : `photos.pose.${p}`)}
            selected={pose === p}
            onPress={() => setPose(p)}
          />
        ))}
      </View>

      {photos.isPending ? (
        <SkeletonGroup accessibilityLabel={t('common.loading')}>
          {[0, 1].map((i) => (
            <View key={i} style={{ gap: 8 }}>
              <Skeleton width={120} height={12} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {poses.map((p) => (
                  <Skeleton
                    key={p}
                    width="31%"
                    height={150}
                    style={{ flex: 1, borderRadius: 14 }}
                  />
                ))}
              </View>
            </View>
          ))}
        </SkeletonGroup>
      ) : null}

      {photos.isSuccess && days.length === 0 ? (
        <EmptyState
          icon="camera"
          title={t('empty.photosTitle')}
          body={t('empty.photosBody')}
          action={{ label: t('photos.add'), icon: 'plus', onPress: () => router.push('/check-in') }}
          actionVariant="primary"
        />
      ) : null}

      <View style={{ gap: 14 }}>
        {days.map((day) => {
          const set = (photos.data ?? []).filter((p) => p.day === day);
          const entry = entries.data?.find((e) => e.day === day);
          return (
            <View key={day} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="label" style={{ flex: 1 }}>
                  {shortDateLabel(day)}
                </Text>
                <Text variant="bodyS" muted>
                  {infoFor(entry, unit)}
                </Text>
                <IconButton
                  icon="trash"
                  accessibilityLabel={t('photos.deleteDay', { date: shortDateLabel(day) })}
                  onPress={() => setDeleting(day)}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {shown.map((p) => (
                  <View key={p} style={{ flex: 1 }}>
                    <PhotoTile
                      photo={set.find((x) => x.pose === p)}
                      pose={p}
                      height={104}
                      label={shortDateLabel(day)}
                    />
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      {/* Before any photo the empty state invites them; with one date, say why compare waits. */}
      {days.length === 0 ? null : (
        <View style={{ gap: 6 }}>
          <Button
            label={t('photos.compare')}
            variant="secondary"
            icon="swap"
            disabled={days.length < 2}
            onPress={() => router.push('/progress/photos/compare')}
          />
          {days.length < 2 ? (
            <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
              {t('photos.compareHint')}
            </Text>
          ) : null}
        </View>
      )}

      <Sheet
        visible={deleting != null && toDelete.length > 0}
        onClose={() => setDeleting(null)}
        title={deleting ? t('photos.deleteTitle', { date: shortDateLabel(deleting) }) : ''}
        closeLabel={t('common.close')}
      >
        <Text muted>{t('photos.deleteBody')}</Text>
        {toDelete.map((p) => (
          <Button
            key={p.id}
            variant="secondary"
            icon="trash"
            label={t('photos.deleteOne', { pose: t(`photos.pose.${p.pose}`).toLowerCase() })}
            disabled={remove.isPending}
            onPress={() => deletePhoto(p)}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

type View2 = 'side' | 'slider';

/** Two check-ins side by side, or with a slider; with the change between them. */
export function ComparePhotosScreen() {
  // Kept out of screenshots and recent apps (DECISIONS 95).
  usePhotoScreenPrivacy();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const lengthUnit = usePreferencesStore((s) => s.lengthUnit);
  const blur = usePrivacyStore((s) => s.blurPhotos);
  const lock = usePrivacyStore((s) => s.lockPhotos);
  const photos = usePhotos();
  const entries = useBodyEntries();
  const goal = useProfile().data?.goal;
  const [mode, setMode] = useState<View2>('side');
  const [pose, setPose] = useState<Pose>('front');
  const [picking, setPicking] = useState<'left' | 'right' | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [leftDay, setLeftDay] = useState<string | null>(null);
  const [rightDay, setRightDay] = useState<string | null>(null);

  const withPose = (photos.data ?? []).filter((p) => p.pose === pose);
  const days = withPose.map((p) => p.day); // newest first
  const left = leftDay && days.includes(leftDay) ? leftDay : (days[days.length - 1] ?? null);
  const right = rightDay && days.includes(rightDay) ? rightDay : (days[0] ?? null);
  const photoOf = (day: string | null) => withPose.find((p) => p.day === day);
  const entryOf = (day: string | null) => entries.data?.find((e) => e.day === day);
  const a = entryOf(left);
  const b = entryOf(right);
  const hidden = blur && !revealed;

  // The change between the two dates, green when it goes the right way (DECISIONS 107, 114).
  const bodyGoal = useBodyGoal().data;
  const item = (
    delta: number,
    l: string,
    rule: string | null | undefined,
    /** The later value and the target, in the unit of delta (green = closer to the target). */
    toward?: { latest: number | null; target: number | null },
  ) => {
    const area = changeArea(delta, rule, 0.05, toward);
    return {
      v: signed(delta),
      l,
      color:
        area === 'better' ? colors.successText : area === 'worse' ? colors.danger : colors.text,
    };
  };
  const diff = [
    a?.weightKg != null && b?.weightKg != null
      ? item(displayWeight(b.weightKg, unit) - displayWeight(a.weightKg, unit), unit, goal, {
          latest: displayWeight(b.weightKg, unit),
          target:
            bodyGoal?.targetWeightKg != null ? displayWeight(bodyGoal.targetWeightKg, unit) : null,
        })
      : null,
    a?.bodyFatPct != null && b?.bodyFatPct != null
      ? item(b.bodyFatPct - a.bodyFatPct, t('photos.bfPts'), 'smallerIsBetter', {
          latest: b.bodyFatPct,
          target: bodyGoal?.targetBodyFatPct ?? null,
        })
      : null,
    a?.measures.waist != null && b?.measures.waist != null
      ? item(
          displayLength(b.measures.waist, lengthUnit).value -
            displayLength(a.measures.waist, lengthUnit).value,
          t('photos.waistIn', { unit: displayLength(0, lengthUnit).unit }),
          'smallerIsBetter',
        )
      : null,
  ].filter((x) => x != null);

  const show = async () => {
    if (lock && !(await authenticate(t('photos.unlock')))) return;
    setRevealed(true);
  };

  return (
    <Screen scroll gap={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton
          icon="chevronLeft"
          accessibilityLabel={t('common.back')}
          onPress={() => goBack(router, '/progress/photos')}
        />
        <View style={{ width: 230 }}>
          <Segmented
            accessibilityLabel={t('photos.view')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'side', label: t('photos.sideBySide') },
              { value: 'slider', label: t('photos.slider') },
            ]}
          />
        </View>
      </View>
      <Text variant="screenTitle">{t('photos.compareTitle')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {poses.map((p) => (
          <Chip
            key={p}
            role="radio"
            label={t(`photos.pose.${p}`)}
            selected={pose === p}
            onPress={() => setPose(p)}
          />
        ))}
      </View>

      {days.length < 2 ? (
        photos.isSuccess ? (
          <EmptyState
            icon="camera"
            title={t('photos.compareEmptyTitle')}
            body={t('photos.compareEmptyBody', {
              pose: t(`photos.pose.${pose}`).toLowerCase(),
            })}
            action={{
              label: t('photos.add'),
              icon: 'plus',
              onPress: () => router.push('/check-in'),
            }}
          />
        ) : null
      ) : (
        <>
          {mode === 'side' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(
                [
                  ['left', left],
                  ['right', right],
                ] as const
              ).map(([side, day]) => (
                <View key={side} style={{ flex: 1, gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('photos.changeDate', {
                      date: day ? shortDateLabel(day) : '',
                    })}
                    onPress={() => setPicking(side)}
                    style={{
                      height: 44,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: colors.borderControl,
                      backgroundColor: colors.surface,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text variant="label">
                      {day ? shortDateLabel(day).split(' ').slice(1).join(' ') : '—'}
                    </Text>
                    <Icon name="chevronDown" size={14} color={colors.text} />
                  </Pressable>
                  <PhotoTile
                    photo={photoOf(day)}
                    pose={pose}
                    height={300}
                    revealed={revealed}
                    interactive={false}
                  />
                  <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
                    {infoFor(entryOf(day), unit)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Slider before={photoOf(left)} after={photoOf(right)} hidden={hidden} />
          )}

          {hidden ? (
            <Button label={t('photos.show')} variant="secondary" icon="lock" onPress={show} />
          ) : null}

          {diff.length > 0 ? (
            <Card size="small" gap={0}>
              <View style={{ flexDirection: 'row' }}>
                {diff.map((d) => (
                  <View key={d.l} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <Text variant="displayS" numeric style={{ color: d.color }}>
                      {d.v}
                    </Text>
                    <Text variant="bodyS" muted>
                      {d.l}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}
        </>
      )}

      <Sheet
        visible={picking != null}
        onClose={() => setPicking(null)}
        title={t('photos.pickDate')}
        closeLabel={t('common.close')}
      >
        {days.map((day) => (
          <Button
            key={day}
            variant="secondary"
            label={shortDateLabel(day)}
            onPress={() => {
              if (picking === 'left') setLeftDay(day);
              else setRightDay(day);
              setPicking(null);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

/** The newer photo revealed over the older one by dragging a handle. */
function Slider({ before, after, hidden }: { before?: Photo; after?: Photo; hidden: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState(0.5);
  const urlA = usePhotoUrl(before?.path);
  const urlB = usePhotoUrl(after?.path);

  const move = (x: number) => {
    if (width > 0) setPos(Math.min(1, Math.max(0, x / width)));
  };

  const blurRadius = hidden ? 40 : 0;
  const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={t('photos.sliderLabel')}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pos * 100) }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => move(e.nativeEvent.locationX)}
      onResponderMove={(e) => move(e.nativeEvent.locationX)}
      style={{
        height: 380,
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.borderControl,
        backgroundColor: colors.surfaceSelected,
      }}
    >
      {urlA.data ? (
        <Image
          source={{ uri: urlA.data }}
          blurRadius={blurRadius}
          contentFit="cover"
          style={fill}
          accessible={false}
          pointerEvents="none"
        />
      ) : null}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: width * pos,
          overflow: 'hidden',
        }}
      >
        {urlB.data ? (
          <Image
            source={{ uri: urlB.data }}
            blurRadius={blurRadius}
            contentFit="cover"
            style={{ width, height: 380 }}
            accessible={false}
          />
        ) : null}
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: width * pos - 1,
          width: 2,
          backgroundColor: colors.text,
        }}
      />
    </View>
  );
}
