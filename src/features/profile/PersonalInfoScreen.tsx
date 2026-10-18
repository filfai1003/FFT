import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { FormHeader } from '@/components/ui/FormHeader';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { parseDecimal } from '@/domain/numbers';
import {
  ageInYears,
  defaultMacros,
  maintenanceKcal,
  suggestedKcal,
  type ActivityLevel,
  type Goal,
  type Sex,
} from '@/domain/nutrition';
import { useGoalForDay, useSaveGoal } from '@/features/diet/log';
import { parseBirthDate, toIsoDate } from '@/features/onboarding/logic';
import { useToday } from '@/features/profile/use-today';
import { goBack } from '@/lib/navigation';
import { useLatestWeight, useProfile, useUpdateProfile } from './api';

type Suggestion = {
  current: number;
  suggested: number;
  maintenance: number;
  macros: ReturnType<typeof defaultMacros>;
};

/** Personal info. When it changes the calorie target, new targets are PROPOSED, never applied. */
export function PersonalInfoScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const profile = useProfile();
  const update = useUpdateProfile();
  const weight = useLatestWeight();
  const today = useToday();
  const goal = useGoalForDay(today);
  const saveGoal = useSaveGoal();

  const p = profile.data;
  const birth = p?.birth_date ? new Date(p.birth_date) : null;
  const [name, setName] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [height, setHeight] = useState<string | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [experience, setExperience] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  if (!p) return <Screen>{null}</Screen>;

  const v = {
    name: name ?? p.name ?? '',
    day: day ?? (birth ? String(birth.getDate()) : ''),
    month: month ?? (birth ? String(birth.getMonth() + 1) : ''),
    year: year ?? (birth ? String(birth.getFullYear()) : ''),
    height: height ?? (p.height_cm != null ? String(Math.round(Number(p.height_cm))) : ''),
    sex: (sex ?? p.sex) as Sex | null,
    activity: (activity ?? p.activity_level) as ActivityLevel | null,
    experience: experience ?? p.experience,
    location: location ?? p.training_location,
  };

  const birthDate = parseBirthDate(v.day, v.month, v.year);
  const age = birthDate ? ageInYears(birthDate, new Date(today)) : null;
  const heightCm = parseDecimal(v.height);
  const valid =
    v.name.trim() !== '' &&
    birthDate != null &&
    (age ?? 0) >= 18 &&
    heightCm != null &&
    heightCm >= 100 &&
    heightCm <= 250 &&
    v.sex != null;

  const submit = async () => {
    if (!valid || !birthDate) return;
    setError(null);
    try {
      await update.mutateAsync({
        name: v.name.trim(),
        birth_date: toIsoDate(birthDate),
        height_cm: heightCm,
        sex: v.sex,
        activity_level: v.activity,
        experience: v.experience as 'beginner' | 'intermediate' | 'advanced' | null,
        training_location: v.location as 'gym' | 'home' | 'bodyweight' | null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    // Do the new details change the calorie target? Then propose it (nothing changes yet).
    if (goal && weight.data && v.activity && p.goal) {
      const maintenance = maintenanceKcal({
        sex: v.sex!,
        weightKg: weight.data.weightKg,
        heightCm: heightCm!,
        ageYears: age!,
        activity: v.activity,
      });
      const suggested = suggestedKcal(maintenance, p.goal as Goal);
      if (goal.maintenanceKcal !== maintenance && Math.abs(suggested - goal.kcal) >= 50) {
        setSuggestion({
          current: goal.kcal,
          suggested,
          maintenance,
          macros: defaultMacros(suggested, weight.data.weightKg),
        });
        return;
      }
    }
    goBack(router, '/profile');
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={18}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router, '/profile') }}
          title={t('profile.personalTitle')}
        />

        <Input
          label={t('onboarding.body.name')}
          value={v.name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.6, gap: 6 }}>
            <Text variant="bodyS" muted>
              {t('onboarding.body.birthDate')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={{ flex: 1 }}>
                <Input
                  variant="compact"
                  accessibilityLabel={t('onboarding.body.day')}
                  placeholder={t('onboarding.body.dayPlaceholder')}
                  value={v.day}
                  onChangeText={(x) => setDay(x.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  variant="compact"
                  accessibilityLabel={t('onboarding.body.month')}
                  placeholder={t('onboarding.body.monthPlaceholder')}
                  value={v.month}
                  onChangeText={(x) => setMonth(x.replace(/\D/g, '').slice(0, 2))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1.5 }}>
                <Input
                  variant="compact"
                  accessibilityLabel={t('onboarding.body.year')}
                  placeholder={t('onboarding.body.yearPlaceholder')}
                  value={v.year}
                  onChangeText={(x) => setYear(x.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label={t('profile.height')}
              variant="compact"
              value={v.height}
              onChangeText={setHeight}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        {birthDate && age != null && age < 18 ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {t('onboarding.body.underage')}
          </Text>
        ) : null}

        <ChipGroup
          legend={t('onboarding.body.sex')}
          value={v.sex}
          onChange={setSex}
          options={[
            { value: 'male', label: t('onboarding.body.male') },
            { value: 'female', label: t('onboarding.body.female') },
          ]}
        />
        <ChipGroup
          legend={t('onboarding.lifestyle.activity')}
          value={v.activity}
          onChange={setActivity}
          options={(['sedentary', 'light', 'active', 'physical'] as const).map((k) => ({
            value: k,
            label: t(`onboarding.lifestyle.${k}`),
          }))}
        />
        <ChipGroup
          legend={t('onboarding.lifestyle.experience')}
          value={v.experience}
          onChange={setExperience}
          options={(['beginner', 'intermediate', 'advanced'] as const).map((k) => ({
            value: k,
            label: t(`onboarding.lifestyle.${k}`),
          }))}
        />
        <ChipGroup
          legend={t('onboarding.lifestyle.location')}
          value={v.location}
          onChange={setLocation}
          options={(['gym', 'home', 'bodyweight'] as const).map((k) => ({
            value: k,
            label: t(`onboarding.lifestyle.${k}`),
          }))}
        />

        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>
      <BottomActionBar>
        <Button
          size="large"
          label={t('profile.saveChanges')}
          disabled={!valid || update.isPending}
          onPress={submit}
        />
      </BottomActionBar>

      <Sheet
        visible={suggestion != null}
        onClose={() => goBack(router, '/profile')}
        title={t('profile.newTargets')}
        closeLabel={t('common.close')}
        footer={
          <View style={{ gap: 8 }}>
            <Button
              size="large"
              label={t('profile.updateTarget')}
              disabled={saveGoal.isPending}
              onPress={async () => {
                if (!suggestion || !goal) return;
                await saveGoal.mutateAsync({
                  validFrom: today,
                  kcal: suggestion.suggested,
                  proteinG: suggestion.macros.proteinG,
                  carbsG: suggestion.macros.carbsG,
                  fatG: suggestion.macros.fatG,
                  trainingDayBonusKcal: goal.trainingDayBonusKcal,
                  maintenanceKcal: suggestion.maintenance,
                  waterMl: goal.waterMl,
                });
                goBack(router, '/profile');
              }}
            />
            <Button
              variant="secondary"
              label={t('profile.keepTarget')}
              onPress={() => goBack(router, '/profile')}
            />
          </View>
        }
      >
        <Text muted>{t('profile.newTargetsBody')}</Text>
        {suggestion ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Text variant="displayM" numeric style={{ opacity: 0.5 }}>
              {suggestion.current}
            </Text>
            <Text variant="bodyS" muted>
              {'→'}
            </Text>
            <Text variant="displayM" numeric>
              {suggestion.suggested}
            </Text>
            <Text variant="bodyS" muted>
              {t('common.kcal')}
            </Text>
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
