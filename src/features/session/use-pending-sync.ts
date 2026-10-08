import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { historyKeys } from '@/features/train/history';
import { recordKeys } from '@/features/train/exercise-stats';
import { progressKeys } from '@/features/progress/data';
import { syncPendingSessions } from './sync';

/** Uploads finished workouts waiting for a connection: at start-up and whenever the network returns. */
export function usePendingSync(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const run = () =>
      void syncPendingSessions(() => {
        void queryClient.invalidateQueries({ queryKey: historyKeys.all });
        void queryClient.invalidateQueries({ queryKey: recordKeys.all });
        void queryClient.invalidateQueries({ queryKey: progressKeys.daily });
        void queryClient.invalidateQueries({ queryKey: ['plan-sessions'] });
      });
    run();
    let wasOnline = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (online && !wasOnline) run();
      wasOnline = online;
    });
    return unsubscribe;
  }, [enabled, queryClient]);
}
