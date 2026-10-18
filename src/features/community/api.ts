import type { SupabaseClient } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  communityPeriodStart,
  communityScores,
  type CommunityMetric,
  type CommunityPeriod,
} from '@/domain/community';
import { useSessionStore } from '@/features/auth/session-store';
import { useGamification } from '@/features/gamification/data';
import { useToday } from '@/features/profile/use-today';
import { useExercises } from '@/features/train/exercises';
import { useActivePlan } from '@/features/train/plans';
import { getMode } from '@/lib/mode';
import { getAuthClient } from '@/lib/supabase';

/**
 * The community lives on the server only (DECISIONS 90), like the relay: shared leaderboards are
 * not the user's own data, so they go through the account client, never the device database. Only
 * the scores computed on the device are sent (`communityScores`), never logs or body data.
 */
const server = () => getAuthClient() as unknown as SupabaseClient;

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await server().rpc(name, args);
  if (error) throw error;
  return data as T;
}

export type CommunityMe = {
  public_id: string;
  name: string;
  invite_code: string;
  level: number;
  badges: string[];
  joined_at: string;
  submitted_at: string | null;
};

export type BoardRow = {
  public_id: string;
  name: string;
  level: number;
  value: number;
  place: number;
  place_before: number;
  is_me: boolean;
};
export type Board = { total: number; rows: BoardRow[] };

export type FriendStatus = 'friends' | 'asked' | 'asked_you';
export type Friend = {
  public_id: string;
  name: string;
  level: number;
  status: FriendStatus;
  value: number | null;
};

export type PublicProfile = {
  public_id: string;
  name: string;
  level: number;
  badges: string[];
  joined_at: string;
  is_me: boolean;
  friend: FriendStatus | null;
  scores: {
    period: CommunityPeriod;
    metric: CommunityMetric;
    value: number;
    place: number;
    total: number;
    top_pct: number;
  }[];
};

export const communityKeys = {
  all: ['community'] as const,
  me: (userId: string | null) => ['community', 'me', userId] as const,
  board: (k: BoardKey) => ['community', 'board', k] as const,
  friends: (k: BoardKey | null) => ['community', 'friends', k] as const,
  profile: (id: string | null) => ['community', 'profile', id] as const,
};

export type BoardKey = {
  period: CommunityPeriod;
  periodStart: string;
  metric: CommunityMetric;
  subject: string;
};

/** The community needs an account: not in the account-less mode. */
export function useCommunityAvailable(): boolean {
  const status = useSessionStore((s) => s.status);
  return status === 'signedIn' && getMode() === 'cloud';
}

export function useCommunityMe() {
  const userId = useSessionStore((s) => s.userId);
  const available = useCommunityAvailable();
  return useQuery({
    queryKey: communityKeys.me(userId),
    enabled: available && userId != null,
    queryFn: () => rpc<CommunityMe | null>('community_me'),
    staleTime: 60_000,
  });
}

export function useBoard(key: BoardKey, enabled: boolean) {
  return useQuery({
    queryKey: communityKeys.board(key),
    enabled,
    queryFn: () =>
      rpc<Board>('community_leaderboard', {
        p_period: key.period,
        p_period_start: key.periodStart,
        p_metric: key.metric,
        p_subject: key.subject,
        p_limit: 8,
      }),
    staleTime: 60_000,
  });
}

export function useFriends(key: BoardKey | null, enabled: boolean) {
  return useQuery({
    queryKey: communityKeys.friends(key),
    enabled,
    queryFn: () =>
      rpc<Friend[]>(
        'community_friends',
        key
          ? {
              p_period: key.period,
              p_period_start: key.periodStart,
              p_metric: key.metric,
              p_subject: key.subject,
            }
          : {},
      ),
    staleTime: 60_000,
  });
}

export function usePublicProfile(publicId: string | null, enabled = true) {
  return useQuery({
    queryKey: communityKeys.profile(publicId),
    enabled,
    queryFn: () => rpc<PublicProfile>('community_profile', { p_public_id: publicId }),
    staleTime: 60_000,
  });
}

function useInvalidateCommunity() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: communityKeys.all });
}

export function useJoinCommunity() {
  const invalidate = useInvalidateCommunity();
  return useMutation({
    mutationFn: (name: string) => rpc<CommunityMe>('community_join', { p_name: name }),
    onSuccess: invalidate,
  });
}

export function useSetCommunityName() {
  const invalidate = useInvalidateCommunity();
  return useMutation({
    mutationFn: (name: string) => rpc<void>('community_set_name', { p_name: name }),
    onSuccess: invalidate,
  });
}

export function useLeaveCommunity() {
  const invalidate = useInvalidateCommunity();
  return useMutation({
    mutationFn: () => rpc<void>('community_leave'),
    onSuccess: () => {
      lastSubmit.clear();
      return invalidate();
    },
  });
}

export function useAddFriend() {
  const invalidate = useInvalidateCommunity();
  return useMutation({
    mutationFn: (who: { code?: string; publicId?: string }) =>
      rpc<'asked' | 'friends'>('community_add_friend', {
        p_code: who.code ?? null,
        p_public_id: who.publicId ?? null,
      }),
    onSuccess: invalidate,
  });
}

export function useAnswerFriend() {
  const invalidate = useInvalidateCommunity();
  return useMutation({
    mutationFn: (a: { publicId: string; accept: boolean }) =>
      rpc<void>('community_answer_friend', { p_public_id: a.publicId, p_accept: a.accept }),
    onSuccess: invalidate,
  });
}

export function useRemoveFriend() {
  const invalidate = useInvalidateCommunity();
  return useMutation({
    mutationFn: (publicId: string) =>
      rpc<void>('community_remove_friend', { p_public_id: publicId }),
    onSuccess: invalidate,
  });
}

/** When this device last sent scores, per account (at most every 10 minutes). */
const lastSubmit = new Map<string, number>();
const SUBMIT_EVERY_MS = 10 * 60 * 1000;

/** Sends the member's current scores, level and badges (no-op for non-members). */
export function useCommunitySubmit() {
  const userId = useSessionStore((s) => s.userId);
  const me = useCommunityMe();
  const game = useGamification();
  const today = useToday();
  const exercises = useExercises();
  const plan = useActivePlan();
  const queryClient = useQueryClient();
  const member = me.data != null;
  const ready = member && game != null && exercises.data != null && !plan.isPending;

  const submit = async (force = false) => {
    if (!userId || !game || !exercises.data) return;
    const last = lastSubmit.get(userId) ?? 0;
    if (!force && Date.now() - last < SUBMIT_EVERY_MS) return;
    lastSubmit.set(userId, Date.now());
    const muscles = new Map(exercises.data.map((e) => [e.id, e.primaryMuscle]));
    const scores = communityScores({
      today,
      workouts: game.activity.workouts,
      dietOnTargetDays: game.activity.dietOnTargetDays,
      daily: game.activity.daily,
      planDays: plan.plan?.days.length ?? 0,
      muscleOf: (id) => muscles.get(id),
    });
    try {
      await rpc<void>('community_submit', {
        p_level: game.level.level,
        p_badges: game.badges.filter((b) => b.earned).map((b) => b.id),
        p_scores: scores,
      });
      await queryClient.invalidateQueries({ queryKey: communityKeys.all });
    } catch {
      // Refused or offline: tried again on the next visit (the leaderboard keeps the last ones).
      lastSubmit.set(userId, last);
    }
  };

  useEffect(() => {
    if (ready) void submit();
    // Once per visit when everything is loaded; `submit` reads the latest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return submit;
}

export const periodStartOf = (period: CommunityPeriod, today: string) =>
  communityPeriodStart(period, today);
