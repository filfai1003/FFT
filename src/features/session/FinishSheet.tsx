import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { touch } from '@/design/tokens';
import { useTheme } from '@/design/use-theme';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { historyKeys } from '@/features/train/history';
import { planKeys } from '@/features/train/plans';
import { recordKeys } from '@/features/train/exercise-stats';
import { finishWorkout } from './finish';
import { totals, unfinished } from './logic';
import { useSessionStore } from './store';

/** "Finish now?": what is left, finish and save, keep training, or discard. */
export function FinishSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.userId);
  const active = useSessionStore((s) => s.active);
  const discard = useSessionStore((s) => s.discard);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!active) return null;
  const left = unfinished(active);
  const sum = totals(active, new Date());
  const nothingDone = sum.setsDone === 0;

  const finish = async () => {
    if (!userId) return;
    setBusy(true);
    const id = await finishWorkout(userId, () => {
      void queryClient.invalidateQueries({ queryKey: historyKeys.all });
      void queryClient.invalidateQueries({ queryKey: recordKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['plan-sessions'] });
      void queryClient.invalidateQueries({ queryKey: planKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['strength'] });
    });
    setBusy(false);
    onClose();
    if (id) router.replace({ pathname: '/session/summary/[sessionId]', params: { sessionId: id } });
  };

  return (
    <>
      <Sheet
        visible={visible && !confirmDiscard}
        onClose={onClose}
        title={t('session.finishTitle')}
        closeLabel={t('common.close')}
      >
        {nothingDone ? (
          // Nothing to save: one sentence, and discarding comes first (still confirmed).
          <>
            <View style={{ gap: 4 }}>
              <Text variant="titleM">{t('session.noSetsYet')}</Text>
              <Text muted>{t('session.finishNothing')}</Text>
            </View>
            <Button
              size="large"
              variant="danger"
              label={t('session.discard')}
              onPress={() => setConfirmDiscard(true)}
            />
            <Button
              size="large"
              variant="secondary"
              label={t('session.keepTraining')}
              onPress={onClose}
            />
          </>
        ) : (
          <Text muted>
            {t('session.finishBody', { done: sum.exercisesDone, total: sum.exercisesTotal })}
          </Text>
        )}

        {!nothingDone && left.length > 0 ? (
          <View
            style={{
              borderTopWidth: 1,
              borderColor: colors.borderDecorative,
            }}
          >
            {left.map((e) => (
              <View
                key={e.name}
                style={{
                  minHeight: touch.minTarget,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottomWidth: 1,
                  borderColor: colors.borderDecorative,
                }}
              >
                <Text variant="bodyS">{e.name}</Text>
                <Text variant="label" muted>
                  {e.done === 0
                    ? t('session.notStarted')
                    : t('session.setsOf', { done: e.done, total: e.total })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {nothingDone ? null : (
          <>
            <Button
              size="large"
              label={t('session.finishAndSave')}
              disabled={busy}
              onPress={finish}
            />
            <Button
              size="large"
              variant="secondary"
              label={t('session.keepTraining')}
              onPress={onClose}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('session.discard')}
              onPress={() => setConfirmDiscard(true)}
              style={{ minHeight: touch.minTarget, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text variant="label" muted>
                {t('session.discard')}
              </Text>
            </Pressable>
          </>
        )}
      </Sheet>

      <Sheet
        visible={visible && confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={t('session.discardTitle')}
        closeLabel={t('common.close')}
        footer={
          <Button
            size="large"
            variant="danger"
            label={t('session.discardConfirm')}
            onPress={() => {
              discard();
              setConfirmDiscard(false);
              onClose();
              router.replace('/train');
            }}
          />
        }
      >
        <Text muted>{t('session.discardBody')}</Text>
      </Sheet>
    </>
  );
}
