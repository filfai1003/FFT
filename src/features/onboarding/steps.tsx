import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { DotBar } from '@/components/ui/DotBar';
import { Input } from '@/components/ui/Input';
import { OptionCard } from '@/components/ui/OptionCard';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { dotsOn } from '@/domain/dots';
import { macroPercents } from '@/domain/nutrition';
import { bodyProblems, starterMeals, targetsFor, type OnboardingDraft } from './logic';

type StepProps = { draft: OnboardingDraft; patch: (p: Partial<OnboardingDraft>) => void };

export function GoalStep({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  const goals = [
    ['lose_fat', 'loseFat'],
    ['maintain', 'maintain'],
    ['build_muscle', 'buildMuscle'],
  ] as const;
  return (
    <View style={{ gap: 12 }} accessibilityRole="radiogroup">
      {goals.map(([value, key]) => (
        <OptionCard
          key={value}
          title={t(`onboarding.goal.${key}`)}
          description={t(`onboarding.goal.${key}Detail`)}
          selected={draft.goal === value}
          onPress={() => patch({ goal: value })}
        />
      ))}
    </View>
  );
}

export function BodyStep({ draft, patch, today }: StepProps & { today: Date }) {
  const { t } = useTranslation();
  const problems = bodyProblems(draft, today);
  const touched = (field: string) => (field === 'name' ? draft.name !== '' : true);
  const birthEntered =
    draft.birthDay !== '' && draft.birthMonth !== '' && draft.birthYear.length === 4;
  return (
    <View style={{ gap: 20 }}>
      <Input
        label={t('onboarding.body.name')}
        value={draft.name}
        onChangeText={(name) => patch({ name })}
        autoComplete="given-name"
        autoCapitalize="words"
      />
      <View style={{ gap: 6 }}>
        <Text variant="label" muted>
          {t('onboarding.body.birthDate')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              variant="compact"
              accessibilityLabel={t('onboarding.body.day')}
              placeholder={t('onboarding.body.dayPlaceholder')}
              value={draft.birthDay}
              onChangeText={(birthDay) =>
                patch({ birthDay: birthDay.replace(/\D/g, '').slice(0, 2) })
              }
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              variant="compact"
              accessibilityLabel={t('onboarding.body.month')}
              placeholder={t('onboarding.body.monthPlaceholder')}
              value={draft.birthMonth}
              onChangeText={(birthMonth) =>
                patch({ birthMonth: birthMonth.replace(/\D/g, '').slice(0, 2) })
              }
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Input
              variant="compact"
              accessibilityLabel={t('onboarding.body.year')}
              placeholder={t('onboarding.body.yearPlaceholder')}
              value={draft.birthYear}
              onChangeText={(birthYear) =>
                patch({ birthYear: birthYear.replace(/\D/g, '').slice(0, 4) })
              }
              keyboardType="number-pad"
            />
          </View>
        </View>
        {birthEntered && problems.includes('underage') ? (
          <Text variant="bodyS" accessibilityRole="alert" danger>
            {t('onboarding.body.underage')}
          </Text>
        ) : null}
        {birthEntered && problems.includes('birth') ? (
          <Text variant="bodyS" accessibilityRole="alert" danger>
            {t('onboarding.body.errorBirth')}
          </Text>
        ) : null}
      </View>
      <ChipGroup
        legend={t('onboarding.body.sex')}
        value={draft.sex}
        onChange={(sex) => patch({ sex })}
        options={[
          { value: 'male', label: t('onboarding.body.male') },
          { value: 'female', label: t('onboarding.body.female') },
        ]}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Input
            label={t('onboarding.body.height')}
            value={draft.heightCm}
            onChangeText={(heightCm) => patch({ heightCm })}
            keyboardType="decimal-pad"
            error={
              touched('height') && draft.heightCm !== '' && problems.includes('height')
                ? t('onboarding.body.errorHeight')
                : undefined
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label={t('onboarding.body.weight')}
            value={draft.weightKg}
            onChangeText={(weightKg) => patch({ weightKg })}
            keyboardType="decimal-pad"
            error={
              draft.weightKg !== '' && problems.includes('weight')
                ? t('onboarding.body.errorWeight')
                : undefined
            }
          />
        </View>
      </View>
    </View>
  );
}

export function LifestyleStep({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 24 }}>
      <ChipGroup
        legend={t('onboarding.lifestyle.activity')}
        value={draft.activity}
        onChange={(activity) => patch({ activity })}
        options={[
          { value: 'sedentary', label: t('onboarding.lifestyle.sedentary') },
          { value: 'light', label: t('onboarding.lifestyle.light') },
          { value: 'active', label: t('onboarding.lifestyle.active') },
          { value: 'physical', label: t('onboarding.lifestyle.physical') },
        ]}
      />
      <ChipGroup
        legend={t('onboarding.lifestyle.experience')}
        value={draft.experience}
        onChange={(experience) => patch({ experience })}
        options={[
          { value: 'beginner', label: t('onboarding.lifestyle.beginner') },
          { value: 'intermediate', label: t('onboarding.lifestyle.intermediate') },
          { value: 'advanced', label: t('onboarding.lifestyle.advanced') },
        ]}
      />
      <ChipGroup
        legend={t('onboarding.lifestyle.location')}
        value={draft.location}
        onChange={(location) => patch({ location })}
        options={[
          { value: 'gym', label: t('onboarding.lifestyle.gym') },
          { value: 'home', label: t('onboarding.lifestyle.home') },
          { value: 'bodyweight', label: t('onboarding.lifestyle.bodyweight') },
        ]}
      />
    </View>
  );
}

export function TargetStep({ draft, patch, today }: StepProps & { today: Date }) {
  const { t } = useTranslation();
  const target = targetsFor(draft, today);
  const percents = macroPercents(target.macros);
  const rows = [
    ['protein', target.macros.proteinG, percents.protein],
    ['carbs', target.macros.carbsG, percents.carbs],
    ['fat', target.macros.fatG, percents.fat],
  ] as const;
  const deltaPct = Math.round(((target.suggested - target.maintenance) / target.maintenance) * 100);
  const suggestion =
    deltaPct === 0
      ? t('onboarding.target.suggestedSame', { kcal: target.suggested })
      : t('onboarding.target.suggested', {
          kcal: target.suggested,
          maintenance: target.maintenance,
          pct: `${deltaPct > 0 ? '+' : '−'}${Math.abs(deltaPct)}%`,
        });
  return (
    <View style={{ gap: 20 }}>
      <Card gap={14}>
        <Text variant="label" muted>
          {t('onboarding.target.daily')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text
            variant="displayXL"
            numeric
            accessibilityLabel={`${target.kcal} ${t('common.kcal')}`}
          >
            {target.kcal}
          </Text>
          <Text variant="label" muted>
            {t('common.kcal')}
          </Text>
        </View>
        <Stepper
          value={target.kcal}
          min={target.minimum}
          max={6000}
          step={50}
          onChange={(targetKcal) => patch({ targetKcal })}
          format={(v) => `${v} ${t('common.kcal')}`}
          decreaseLabel={t('onboarding.target.lower')}
          increaseLabel={t('onboarding.target.raise')}
        />
        <Text variant="label" muted>
          {suggestion}
        </Text>
      </Card>
      <Card gap={12}>
        <Text variant="label" muted>
          {t('onboarding.target.macroSplit')}
        </Text>
        {rows.map(([key, grams, pct]) => (
          <View key={key} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="body">{t(`onboarding.target.${key}`)}</Text>
              <Text variant="label" muted>
                {`${grams} g · ${pct}%`}
              </Text>
            </View>
            <DotBar
              total={20}
              on={dotsOn(pct, 100, 20)}
              accessibilityLabel={t(`onboarding.target.${key}`)}
            />
          </View>
        ))}
      </Card>
      <Text variant="bodyS" muted>
        {t('onboarding.target.safety')}
      </Text>
    </View>
  );
}

export function ModeStep({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 12 }} accessibilityRole="radiogroup">
      <OptionCard
        title={t('onboarding.mode.tracking')}
        description={t('onboarding.mode.trackingDetail')}
        selected={draft.dietMode === 'tracking'}
        onPress={() => patch({ dietMode: 'tracking' })}
      />
      <OptionCard
        title={t('onboarding.mode.fixed')}
        description={t('onboarding.mode.fixedDetail')}
        selected={draft.dietMode === 'fixed_meals'}
        onPress={() => patch({ dietMode: 'fixed_meals' })}
      />
    </View>
  );
}

export function MealsStep({ draft, today }: StepProps & { today: Date }) {
  const { t } = useTranslation();
  const target = targetsFor(draft, today);
  const meals = starterMeals(target.kcal, target.macros);
  return (
    <View style={{ gap: 12 }}>
      {meals.map((m) => (
        <Card key={m.position} size="small" gap={4}>
          <Text variant="titleM">{m.name}</Text>
          <Text variant="label" muted>
            {t('onboarding.meals.line', {
              kcal: m.kcal,
              p: m.proteinG,
              c: m.carbsG,
              f: m.fatG,
            })}
          </Text>
        </Card>
      ))}
    </View>
  );
}

export function ConsentStep({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 16 }}>
      <Text muted>{t('onboarding.consent.body')}</Text>
      <Card gap={0}>
        <ConsentRow
          title={t('onboarding.consent.health')}
          detail={t('onboarding.consent.healthDetail')}
          value={draft.consentHealth}
          onValueChange={(consentHealth) => patch({ consentHealth })}
        />
        <ConsentRow
          title={t('onboarding.consent.analytics')}
          detail={t('onboarding.consent.analyticsDetail')}
          value={draft.consentAnalytics}
          onValueChange={(consentAnalytics) => patch({ consentAnalytics })}
        />
      </Card>
    </View>
  );
}

function ConsentRow(props: {
  title: string;
  detail: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 8,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text>{props.title}</Text>
        <Text variant="label" muted>
          {props.detail}
        </Text>
      </View>
      <Toggle
        value={props.value}
        onValueChange={props.onValueChange}
        accessibilityLabel={props.title}
      />
    </View>
  );
}
