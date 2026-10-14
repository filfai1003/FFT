import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { FormHeader } from '@/components/ui/FormHeader';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { fontFamily } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel, weekdayName } from '@/domain/day';
import { parseDecimal } from '@/domain/numbers';
import { displayWeight, storedWeight } from '@/domain/units';
import { usePrivacyStore } from '@/features/profile/privacy-store';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { goBack } from '@/lib/navigation';
import { useToastStore } from '@/lib/toast-store';
import {
  measureKeys,
  poses,
  useBodyEntries,
  useSaveCheckIn,
  type MeasureKey,
  type Pose,
} from './data';
import { usePhotoDraft } from './photo-draft';

/** Check-in: weight, body fat, measurements, photos and notes. Every field is optional. */
export function CheckInScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const today = useToday();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const method = usePrivacyStore((s) => s.bodyFatMethod);
  const entries = useBodyEntries();
  const save = useSaveCheckIn();
  const showToast = useToastStore((s) => s.show);
  const photos = usePhotoDraft((s) => s.photos);
  const clearPhotos = usePhotoDraft((s) => s.clear);

  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [measures, setMeasures] = useState<Partial<Record<MeasureKey, string>>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Photos from a previous, abandoned check-in must not leak into this one.
  useEffect(() => () => clearPhotos(), [clearPhotos]);

  const list = entries.data ?? [];
  const lastWeight = [...list].reverse().find((e) => e.weightKg != null);
  const lastOf = (k: MeasureKey) =>
    [...list].reverse().find((e) => e.measures[k] != null)?.measures[k];

  const submit = async () => {
    setError(null);
    const w = parseDecimal(weight);
    const bf = parseDecimal(bodyFat);
    const m: Partial<Record<MeasureKey, number>> = {};
    for (const k of measureKeys) {
      const v = parseDecimal(measures[k] ?? '');
      if (v != null) m[k] = v;
    }
    try {
      await save.mutateAsync({
        day: today,
        weightKg: w != null ? storedWeight(w, unit) : null,
        bodyFatPct: bf,
        method: bf != null ? method : null,
        measures: m,
        notes,
        photos,
      });
      clearPhotos();
      goBack(router, '/progress');
      showToast({ message: t('checkIn.saved') });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const big = (
    label: string,
    value: string,
    set: (v: string) => void,
    unitLabel: string,
    hint: string,
  ) => (
    <View
      style={{
        flex: 1,
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.borderControl,
        backgroundColor: colors.surface,
      }}
    >
      <Text variant="label" muted>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={set}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textPlaceholderIcon}
          selectionColor={colors.accent}
          style={{
            minWidth: 70,
            padding: 0,
            color: colors.text,
            fontFamily: fontFamily.display,
            fontSize: 32,
          }}
        />
        <Text variant="label" muted>
          {unitLabel}
        </Text>
      </View>
      <Text variant="label" muted>
        {hint}
      </Text>
    </View>
  );

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={18}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router, '/progress') }}
          title={t('checkIn.title')}
        />
        <View style={{ gap: 6 }}>
          <Text variant="screenTitle" style={{ fontSize: 36 }} accessibilityRole="header">
            {shortDateLabel(today)}
          </Text>
          <Text variant="label" muted>
            {t('checkIn.optional')}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {big(
            t('checkIn.weight'),
            weight,
            setWeight,
            unit,
            lastWeight
              ? t('checkIn.last', {
                  value: displayWeight(lastWeight.weightKg!, unit),
                  day: weekdayName(lastWeight.day).slice(0, 3),
                })
              : t('checkIn.firstTime'),
          )}
          {big(t('checkIn.bodyFat'), bodyFat, setBodyFat, '%', t(`progress.method.${method}`))}
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="label" muted>
            {t('checkIn.measurements')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {measureKeys.map((k) => (
              <View key={k} style={{ width: '48.5%' }}>
                <Input
                  variant="compact"
                  label={t(`progress.measure.${k}`)}
                  value={measures[k] ?? ''}
                  onChangeText={(v) => setMeasures((s) => ({ ...s, [k]: v }))}
                  placeholder={lastOf(k) != null ? String(lastOf(k)) : '—'}
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Text variant="label" muted>
            {t('checkIn.photos')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {poses.map((pose) => (
              <PhotoButton
                key={pose}
                pose={pose}
                uri={photos[pose]}
                onPress={() => router.push({ pathname: '/photo-camera', params: { pose } })}
              />
            ))}
          </View>
        </View>

        <Input
          accessibilityLabel={t('checkIn.notes')}
          placeholder={t('checkIn.notesPlaceholder')}
          value={notes}
          onChangeText={setNotes}
        />
        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button size="large" label={t('checkIn.save')} disabled={save.isPending} onPress={submit} />
      </BottomActionBar>
    </>
  );
}

function PhotoButton({ pose, uri, onPress }: { pose: Pose; uri?: string; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('checkIn.takePhoto', { pose: t(`photos.pose.${pose}`) })}
      onPress={onPress}
      style={{
        flex: 1,
        height: 112,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: uri ? 'solid' : 'dashed',
        borderColor: colors.borderControl,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          contentFit="cover"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          accessible={false}
        />
      ) : (
        <Icon name="camera" size={22} color={colors.textMuted} />
      )}
      <Text variant="label">{t(`photos.pose.${pose}`)}</Text>
    </Pressable>
  );
}
