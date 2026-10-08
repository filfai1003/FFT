import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ExerciseImage } from '@/components/ui/ExerciseImage';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { exerciseImageUrl, useExercises } from '@/features/train/exercises';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Dev-only smoke test of the whole stack: sign in anonymously (local Supabase only), read the
 * exercise catalogue through RLS and show it with ExerciseImage.
 */
export default function ExercisesSmokeTest() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Body />;
}

function Body() {
  const [signedIn, setSignedIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const exercises = useExercises();

  if (!isSupabaseConfigured) {
    return (
      <Screen scroll>
        <Text variant="screenTitle">Exercises</Text>
        <Text>
          Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. See .env.example.
        </Text>
      </Screen>
    );
  }

  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

  return (
    <Screen scroll>
      <Text variant="screenTitle">Exercises</Text>
      <Button
        label="Sign in anonymously (dev)"
        variant="secondary"
        onPress={async () => {
          const { error } = await getSupabase().auth.signInAnonymously();
          setAuthError(error?.message ?? null);
          setSignedIn(!error);
          void exercises.refetch();
        }}
      />
      {authError ? <Text>{authError}</Text> : null}
      {signedIn ? (
        <Text variant="label" muted>{`${exercises.data?.length ?? 0} exercises`}</Text>
      ) : null}
      {exercises.error ? <Text>{String(exercises.error.message)}</Text> : null}
      {exercises.data?.map((e) => (
        <Card key={e.id} size="small" gap={4}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ExerciseImage size={40} uri={exerciseImageUrl(baseUrl, e.imagePath)} />
            <View style={{ flex: 1 }}>
              <Text>{e.name}</Text>
              <Text variant="label" muted>
                {`${e.primaryMuscle} · ${e.equipment}`}
              </Text>
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
