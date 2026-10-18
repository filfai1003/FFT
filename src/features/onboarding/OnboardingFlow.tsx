import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { DotBar } from '@/components/ui/DotBar';
import { FormHeader } from '@/components/ui/FormHeader';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { signOut } from '@/features/auth/api';
import { useSessionStore } from '@/features/auth/session-store';
import { profileKey } from '@/features/profile/api';
import { useQueryClient } from '@tanstack/react-query';
import { useOnboardingStore, stepsFor, type StepId } from './draft-store';
import { bodyProblems, type OnboardingDraft } from './logic';
import {
  BodyStep,
  ConsentStep,
  GoalStep,
  LifestyleStep,
  MealsStep,
  ModeStep,
  TargetStep,
  AiStep,
} from './steps';
import { completeOnboarding } from './submit';

function canContinue(step: StepId, d: OnboardingDraft, today: Date): boolean {
  switch (step) {
    case 'goal':
      return d.goal != null;
    case 'body':
      return bodyProblems(d, today).length === 0;
    case 'lifestyle':
      return d.activity != null && d.experience != null && d.location != null;
    case 'mode':
      return d.dietMode != null;
    case 'meals':
      return d.meals == null || d.meals.every((m) => m.name.trim() !== '');
    case 'consent':
      return d.consentHealth;
    default:
      return true;
  }
}

export function OnboardingFlow() {
  const { t } = useTranslation();
  const barHeight = useActionBarHeight();
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const { draft, step, patch, next, back, reset } = useOnboardingStore();
  const [today] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = stepsFor(draft);
  const id = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;

  const finish = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    const message = await completeOnboarding(draft, userId, t('onboarding.meals.planName'));
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    reset();
    // Consents, goals, meals… were read before they existed: refresh everything else first, so the
    // app does not start on stale data (e.g. "consent withdrawn"), then the profile, which says
    // "onboarded" and makes the navigation guard send the user to the app.
    const profile = profileKey(userId);
    await queryClient.invalidateQueries({
      predicate: (q) => q.queryKey.join('/') !== profile.join('/'),
    });
    await queryClient.invalidateQueries({ queryKey: profile });
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={20}>
        <FormHeader
          left={
            step === 0
              ? { label: t('onboarding.signOut'), onPress: () => void signOut() }
              : { label: t('common.back'), onPress: back, icon: 'chevronLeft' }
          }
        />
        <DotBar
          shape="segment"
          total={steps.length}
          on={step + 1}
          accessibilityLabel={t('onboarding.progress', { current: step + 1, total: steps.length })}
        />
        <View style={{ gap: 6 }}>
          <Text variant="bodyS" semibold muted>
            {t('onboarding.progress', { current: step + 1, total: steps.length })}
          </Text>
          <Text variant="screenTitle" accessibilityRole="header">
            {t(`onboarding.${id}.title`)}
          </Text>
        </View>

        {id === 'goal' ? <GoalStep draft={draft} patch={patch} /> : null}
        {id === 'body' ? <BodyStep draft={draft} patch={patch} today={today} /> : null}
        {id === 'lifestyle' ? <LifestyleStep draft={draft} patch={patch} /> : null}
        {id === 'target' ? <TargetStep draft={draft} patch={patch} today={today} /> : null}
        {id === 'mode' ? <ModeStep draft={draft} patch={patch} /> : null}
        {id === 'meals' ? <MealsStep draft={draft} patch={patch} today={today} /> : null}
        {id === 'consent' ? <ConsentStep draft={draft} patch={patch} /> : null}
        {id === 'ai' ? <AiStep bottomOffset={barHeight} /> : null}

        {error ? (
          <Text variant="bodyS" danger accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </Screen>

      <BottomActionBar>
        <Button
          size="large"
          label={last ? t('onboarding.finish') : t('common.continue')}
          disabled={busy || !canContinue(id, draft, today)}
          onPress={last ? finish : next}
        />
      </BottomActionBar>
    </>
  );
}
