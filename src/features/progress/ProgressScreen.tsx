import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { DotColumnChart } from '@/components/ui/DotColumnChart';
import { Screen } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { shortDateLabel } from '@/domain/day';
import { periods, type Period } from '@/domain/progress';
import { displayWeight } from '@/domain/units';
import { useToday } from '@/features/profile/use-today';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { poses, useBodyEntries, usePhotos } from './data';
import { PhotoTile } from './PhotoTile';
import { bodyProgress, useProgressPeriod } from './series';
import { useStrength } from './strength';

export const signed = (n: number, digits = 1) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;

/** Fill missing chart values so every column shows at least one dot. */
export const chartValues = (v: (number | null)[]) => {
  const real = v.filter((x): x is number => x != null);
  const min = real.length ? Math.min(...real) : 0;
  return v.map((x) => x ?? min);
};

/** Progress tab: strength, body weight, body fat and photos over the chosen period. */
export function ProgressScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const today = useToday();
  const unit = usePreferencesStore((s) => s.weightUnit);
  const { period, setPeriod } = useProgressPeriod();
  const strength = useStrength(period);
  const entries = useBodyEntries();
  const photos = usePhotos();
  const body = bodyProgress(entries.data ?? [], period, today);

  const photoDays = new Set((photos.data ?? []).map((p) => p.day)).size;
  const lastPhotoDay = photos.data?.[0]?.day ?? null;
  const lastSet = photos.data?.filter((p) => p.day === lastPhotoDay) ?? [];
  const top = strength.groups.slice(0, 3);

  const weightValue =
    body.weight.latestKg != null ? displayWeight(body.weight.latestKg, unit) : null;
  const weightDelta =
    body.weight.deltaKg != null
      ? displayWeight(Math.abs(body.weight.deltaKg), unit) * Math.sign(body.weight.deltaKg)
      : null;

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <View
        style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <View style={{ gap: 4 }}>
          <Text variant="label" muted>
            {t('progress.since', {
              date: shortDateLabel(strength.from).split(' ').slice(1).join(' '),
            })}
          </Text>
          <Text variant="screenTitle">{t('nav.progress')}</Text>
        </View>
        <IconButton
          icon="plus"
          accessibilityLabel={t('progress.newCheckIn')}
          onPress={() => router.push('/check-in')}
        />
      </View>

      <Segmented
        accessibilityLabel={t('progress.range')}
        value={period}
        onChange={(p: Period) => setPeriod(p)}
        options={periods.map((p) => ({ value: p, label: t(`progress.period.${p}`) }))}
      />

      <Card
        onPress={() => router.push('/progress/strength')}
        accessibilityLabel={t('progress.strength')}
        gap={12}
      >
        <CardHead label={t('progress.strength')} />
        {strength.overall != null ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Text
                variant="displayL"
                numeric
                style={{ color: strength.overall >= 0 ? colors.successText : colors.warningText }}
              >{`${signed(strength.overall)}%`}</Text>
              <Text variant="label" muted style={{ flex: 1 }}>
                {t('progress.avgChange')}
              </Text>
            </View>
            <DotColumnChart
              values={chartValues(strength.series)}
              rows={8}
              stretch
              accessibilityLabel={t('progress.strengthChart', { pct: signed(strength.overall) })}
            />
            {top.length > 0 ? (
              <Text variant="bodyS" muted>
                {`${t('progress.top')} · ${top.map((g) => `${t(`progress.group.${g.group}`)} ${signed(g.pctChange, 0)}%`).join(' · ')}`}
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="displayL" numeric muted>
            {'—'}
          </Text>
        )}
      </Card>

      <Card
        onPress={() => router.push('/progress/body')}
        accessibilityLabel={t('progress.bodyTitle')}
        gap={12}
      >
        <CardHead label={t('progress.bodyTitle')} />
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text variant="label" muted>
              {t('progress.tabWeight')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text variant="displayM" numeric>
                {weightValue ?? '—'}
              </Text>
              <Text variant="label" muted>
                {unit}
              </Text>
            </View>
            {body.weight.buckets.some((v) => v != null) ? (
              <DotColumnChart
                values={chartValues(body.weight.buckets)}
                rows={5}
                dotSize={6}
                columnGap={3}
                stretch
                accessibilityLabel={t('progress.weightChart')}
              />
            ) : null}
            {weightDelta != null ? (
              <Text variant="label" muted>
                {`${signed(weightDelta)} ${unit}`}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              width: 1,
              alignSelf: 'stretch',
              backgroundColor: colors.borderDecorative,
            }}
          />
          <View style={{ flex: 1, gap: 8 }}>
            <Text variant="label" muted>
              {t('progress.tabFat')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text variant="displayM" numeric>
                {body.bodyFat.latestPct ?? '—'}
              </Text>
              <Text variant="label" muted>
                {'%'}
              </Text>
            </View>
            {body.bodyFat.buckets.some((v) => v != null) ? (
              <DotColumnChart
                values={chartValues(body.bodyFat.buckets)}
                rows={5}
                dotSize={6}
                columnGap={3}
                stretch
                accessibilityLabel={t('progress.bodyFatChart')}
              />
            ) : null}
            {body.bodyFat.deltaPts != null ? (
              <Text variant="label" muted>
                {t('progress.pts', { delta: signed(body.bodyFat.deltaPts) })}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      <Card
        onPress={() => router.push('/progress/photos')}
        accessibilityLabel={t('progress.photos')}
        gap={10}
      >
        <CardHead
          label={
            lastPhotoDay
              ? t('progress.photosLast', {
                  date: shortDateLabel(lastPhotoDay).split(' ').slice(1).join(' '),
                })
              : t('progress.photosNone')
          }
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {poses.map((pose) => (
            <View key={pose} style={{ flex: 1 }}>
              <PhotoTile
                photo={lastSet.find((p) => p.pose === pose)}
                pose={pose}
                height={72}
                interactive={false}
              />
            </View>
          ))}
        </View>
      </Card>
      <Button
        label={t('progress.compare')}
        icon="swap"
        variant="secondary"
        disabled={photoDays < 2}
        onPress={() => router.push('/progress/photos/compare')}
      />
      <Text variant="label" muted style={{ color: colors.textMuted, textAlign: 'center' }}>
        {t('progress.today', { date: shortDateLabel(today) })}
      </Text>
    </Screen>
  );
}

/** Label of a card that opens a detail page; the chevron says it is tappable. */
function CardHead({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text variant="label" muted style={{ flex: 1 }}>
        {label}
      </Text>
      <Icon name="chevronRight" size={16} color={colors.textMuted} />
    </View>
  );
}
