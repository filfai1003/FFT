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
import {
  canContinue,
  continueReason,
  skipDefaults,
  useOnboardingStore,
  stepsFor,
} from './draft-store';
import { bodyProblems } from './logic';
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

export function OnboardingFlow() {
  const { t } = useTranslation();
  const barHeight = useActionBarHeight();
  const queryClient = useQueryClient();
  const userId = useSessionStore((s) => s.userId);
  const { draft, step, skipped, patch, next, back, skipStep, skipSetup, reset } =
    useOnboardingStore();
  const [today] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = stepsFor(draft, undefined, skipped);
  const id = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  // Shown under the disabled main button: what is missing (never while saving).
  const reason = busy ? null : continueReason(id, draft, today);

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
      {/* The reason line under the button makes the bar taller: room for it too. */}
      <Screen scroll bottomBarHeight={barHeight + 24 + (reason ? 32 : 0)} gap={20}>
        <FormHeader
          left={
            step === 0
              ? { label: t('onboarding.signOut'), onPress: () => void signOut() }
              : { label: t('common.back'), onPress: back, icon: 'chevronLeft' }
          }
          right={
            skipDefaults[id] ? (
              <Button
                variant="ghost"
                size="small"
                block={false}
                label={t('onboarding.skip')}
                accessibilityLabel={t('onboarding.skipStep')}
                onPress={() => skipStep(id)}
              />
            ) : undefined
          }
        />
        <DotBar
          shape="segment"
          total={steps.length}
          on={step + 1}
          accessibilityLabel={t('onboarding.progress', { current: step + 1, total: steps.length })}
        />
        {/* The bar is the progress (read as "Step 2 of 6"): no second "Step x of y" line. */}
        <Text variant="screenTitle" accessibilityRole="header">
          {t(`onboarding.${id}.title`)}
        </Text>

        {id === 'goal' ? <GoalStep draft={draft} patch={patch} /> : null}
        {id === 'body' ? <BodyStep draft={draft} patch={patch} today={today} /> : null}
        {id === 'lifestyle' ? <LifestyleStep draft={draft} patch={patch} /> : null}
        {id === 'target' ? <TargetStep draft={draft} patch={patch} today={today} /> : null}
        {id === 'mode' ? <ModeStep draft={draft} patch={patch} /> : null}
        {id === 'meals' ? <MealsStep draft={draft} patch={patch} today={today} /> : null}
        {id === 'consent' ? <ConsentStep draft={draft} patch={patch} /> : null}
        {id === 'ai' ? <AiStep bottomOffset={barHeight} /> : null}

        {!skipped && id !== 'consent' && id !== 'ai' ? (
          <View style={{ gap: 4 }}>
            <Button
              variant="ghost"
              label={t('onboarding.skipSetup')}
              disabled={busy || bodyProblems(draft, today).length > 0}
              onPress={skipSetup}
            />
            <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
              {id === 'body' && bodyProblems(draft, today).length > 0
                ? t('onboarding.skipSetupNeeds')
                : t('onboarding.skipSetupDetail')}
            </Text>
          </View>
        ) : null}

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
          disabled={!canContinue(id, draft, today)}
          loading={busy}
          disabledReason={reason ? t(`onboarding.reason.${reason}`) : undefined}
          onPress={last ? finish : next}
        />
      </BottomActionBar>
    </>
  );
}
