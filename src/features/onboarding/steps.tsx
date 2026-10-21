import { useRef } from 'react';
import { ConnectAiButtons } from '@/features/premium/ConnectAiButtons';
import { SyncNeededCard } from '@/features/premium/ServerCopy';
import { useSyncChoice } from '@/lib/plan';
import { useTranslation } from 'react-i18next';
import { View, type TextInput } from 'react-native';
import { Card } from '@/components/ui/Card';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { InfoButton } from '@/components/ui/InfoButton';
import { Input } from '@/components/ui/Input';
import { OptionCard } from '@/components/ui/OptionCard';
import { Segmented } from '@/components/ui/Segmented';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { MacroSplitCard } from '@/features/diet/MacroSplitCard';
import { MealPlanEditor } from '@/features/diet/MealPlanEditor';
import { LegalLinks } from '@/features/legal/LegalLinks';
import { ConsentRow, SexChips } from './fields';
import { bodyProblems, starterMeals, targetsFor, type OnboardingDraft } from './logic';

type StepProps = { draft: OnboardingDraft; patch: (p: Partial<OnboardingDraft>) => void };

export function GoalStep({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  // Glyph per goal, as in the canvas "Onboarding · goal": neutral tiles (a goal is no area of the
  // colour code, DECISIONS 107; the arrow says it).
  const goals = [
    ['lose_fat', 'loseFat', 'arrowDown'],
    ['maintain', 'maintain', 'minus'],
    ['build_muscle', 'buildMuscle', 'arrowUp'],
  ] as const;
  return (
    <View style={{ gap: 10 }} accessibilityRole="radiogroup">
      {goals.map(([value, key, icon]) => (
        <OptionCard
          key={value}
          title={t(`onboarding.goal.${key}`)}
          description={t(`onboarding.goal.${key}Detail`)}
          selected={draft.goal === value}
          onPress={() => patch({ goal: value })}
          icon={{ name: icon }}
        />
      ))}
    </View>
  );
}

export function BodyStep({ draft, patch, today }: StepProps & { today: Date }) {
  const { t } = useTranslation();
  const problems = bodyProblems(draft, today);
  // Birth date: two digits in the day move to the month, two in the month to the year, four in the
  // year to the height, so the date is typed in one go.
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);
  const heightRef = useRef<TextInput>(null);
  const birthEntered =
    draft.birthDay !== '' && draft.birthMonth !== '' && draft.birthYear.length === 4;
  return (
    <View style={{ gap: 20 }}>
      <Input
        label={t('onboarding.body.name')}
        value={draft.name}
        onChangeText={(name) => patch({ name })}
        placeholder={t('forms.namePlaceholder')}
        autoComplete="given-name"
        autoCapitalize="words"
      />
      <Card gap={0}>
        <ConsentRow
          title={t('onboarding.body.adult')}
          detail={t('onboarding.body.adultDetail')}
          value={draft.adultConfirmed}
          onValueChange={(adultConfirmed) => patch({ adultConfirmed })}
        />
      </Card>
      <Text variant="bodyS" muted>
        {t('onboarding.body.optionalIntro')}
      </Text>
      <View style={{ gap: 6 }}>
        <Text variant="bodyS" semibold muted>
          {t('onboarding.body.birthDateOptional')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Input
              variant="compact"
              accessibilityLabel={t('onboarding.body.day')}
              placeholder={t('onboarding.body.dayPlaceholder')}
              value={draft.birthDay}
              onChangeText={(birthDay) => {
                const day = birthDay.replace(/\D/g, '').slice(0, 2);
                patch({ birthDay: day });
                if (day.length === 2) monthRef.current?.focus();
              }}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              variant="compact"
              accessibilityLabel={t('onboarding.body.month')}
              placeholder={t('onboarding.body.monthPlaceholder')}
              ref={monthRef}
              value={draft.birthMonth}
              onChangeText={(birthMonth) => {
                const month = birthMonth.replace(/\D/g, '').slice(0, 2);
                patch({ birthMonth: month });
                if (month.length === 2) yearRef.current?.focus();
              }}
              keyboardType="number-pad"
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Input
              variant="compact"
              accessibilityLabel={t('onboarding.body.year')}
              placeholder={t('onboarding.body.yearPlaceholder')}
              ref={yearRef}
              value={draft.birthYear}
              onChangeText={(birthYear) => {
                const year = birthYear.replace(/\D/g, '').slice(0, 4);
                patch({ birthYear: year });
                if (year.length === 4) heightRef.current?.focus();
              }}
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
      <SexChips value={draft.sex} onChange={(sex) => patch({ sex })} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Input
            ref={heightRef}
            label={t('onboarding.body.heightOptional')}
            value={draft.heightCm}
            onChangeText={(heightCm) => patch({ heightCm })}
            placeholder={t('forms.heightPlaceholder')}
            keyboardType="decimal-pad"
            error={
              draft.heightCm.trim() !== '' && problems.includes('height')
                ? t('onboarding.body.errorHeight')
                : undefined
            }
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label={t('onboarding.body.weightOptional')}
            value={draft.weightKg}
            onChangeText={(weightKg) => patch({ weightKg })}
            placeholder={t('forms.weightPlaceholder')}
            keyboardType="decimal-pad"
            error={
              draft.weightKg.trim() !== '' && problems.includes('weight')
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
  // Without sex, birth date, height or weight there is no suggestion: the user picks the target
  // (starting at a default, never under 1500 kcal) and can add the details later (DECISIONS 103).
  const suggestion = (() => {
    if (target.suggested == null || target.maintenance == null)
      return t('onboarding.target.noSuggestion');
    const deltaPct = Math.round(
      ((target.suggested - target.maintenance) / target.maintenance) * 100,
    );
    return deltaPct === 0
      ? t('onboarding.target.suggestedSame', { kcal: target.suggested })
      : t('onboarding.target.suggested', {
          kcal: target.suggested,
          maintenance: target.maintenance,
          pct: `${deltaPct > 0 ? '+' : '−'}${Math.abs(deltaPct)}%`,
        });
  })();
  // "No target" (DECISIONS 104): calories are tracked without a target; one can be set later.
  const choice = (
    <Segmented
      accessibilityLabel={t('goals.target')}
      value={draft.target}
      onChange={(target) => patch({ target, meals: null })}
      options={[
        { value: 'set', label: t('goals.setTarget') },
        { value: 'none', label: t('goals.noTarget') },
      ]}
    />
  );
  if (draft.target === 'none')
    return (
      <View style={{ gap: 20 }}>
        {choice}
        <Text muted>{t('onboarding.target.noTargetDetail')}</Text>
      </View>
    );
  return (
    <View style={{ gap: 20 }}>
      {choice}
      <Card gap={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="bodyS" semibold muted>
            {t('onboarding.target.daily')}
          </Text>
          <InfoButton topic="calorieTarget" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text
            variant="displayXL"
            numeric
            accessibilityLabel={`${target.kcal} ${t('common.kcal')}`}
          >
            {target.kcal}
          </Text>
          <Text variant="bodyS" semibold muted>
            {t('common.kcal')}
          </Text>
        </View>
        <Stepper
          value={target.kcal}
          min={target.minimum}
          max={6000}
          step={50}
          onChange={(targetKcal) => patch({ targetKcal, meals: null })}
          format={(v) => `${v} ${t('common.kcal')}`}
          decreaseLabel={t('onboarding.target.lower')}
          increaseLabel={t('onboarding.target.raise')}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="bodyS" semibold muted style={{ flexShrink: 1 }}>
            {suggestion}
          </Text>
          <InfoButton topic="maintenance" />
        </View>
      </Card>
      <MacroSplitCard
        kcal={target.kcal}
        percents={target.split}
        onChange={(macroSplit) => patch({ macroSplit, meals: null })}
      />
      <Text variant="bodyS" muted>
        {t('onboarding.target.safety')} {t('onboarding.target.notMedical')}
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
        icon={{ name: 'search', area: 'nutrition' }}
      />
      <OptionCard
        title={t('onboarding.mode.fixed')}
        description={t('onboarding.mode.fixedDetail')}
        selected={draft.dietMode === 'fixed_meals'}
        onPress={() => patch({ dietMode: 'fixed_meals' })}
        icon={{ name: 'list', area: 'nutrition' }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
        <Text variant="bodyS" muted style={{ flexShrink: 1 }}>
          {t('help.whichMode')}
        </Text>
        <InfoButton topic="trackingMode" />
      </View>
    </View>
  );
}

export function MealsStep({ draft, patch, today }: StepProps & { today: Date }) {
  const target = targetsFor(draft, today);
  const goal = { kcal: target.kcal, ...target.macros };
  const meals = draft.meals ?? starterMeals(goal);
  const workoutAfter = meals.some((m) => m.id === draft.workoutAfterId)
    ? draft.workoutAfterId
    : null;
  return (
    <MealPlanEditor
      meals={meals}
      onMealsChange={(next) => patch({ meals: next })}
      goal={draft.target === 'set' ? goal : null}
      workoutAfter={workoutAfter}
      onWorkoutAfterChange={(workoutAfterId) => patch({ workoutAfterId })}
    />
  );
}

/** Optional: FFT in Claude or ChatGPT (MCP). Finishing works the same with or without it. */
export function AiStep({ bottomOffset }: { bottomOffset: number }) {
  const { t } = useTranslation();
  // AI apps read the copy on the server: without it, say so and offer it (DECISIONS 62).
  const synced = useSyncChoice() === 'on';
  return (
    <View style={{ gap: 16 }}>
      <Text muted>{t('onboarding.ai.body')}</Text>
      {synced ? (
        <Card gap={10}>
          <ConnectAiButtons bottomOffset={bottomOffset} />
        </Card>
      ) : (
        <SyncNeededCard />
      )}
      <Text variant="bodyS" muted>
        {t('onboarding.ai.later')}
      </Text>
    </View>
  );
}

export function ConsentStep({ draft, patch }: StepProps) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: 16 }}>
      <View>
        <Text muted>{t('onboarding.consent.body')}</Text>
        <LegalLinks pages={['privacy']} />
      </View>
      <Card gap={0}>
        <ConsentRow
          title={t('onboarding.consent.health')}
          detail={t('onboarding.consent.healthDetail')}
          value={draft.consentHealth}
          onValueChange={(consentHealth) => patch({ consentHealth })}
        />
      </Card>
    </View>
  );
}
