import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { BottomActionBar, useActionBarHeight } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { ExerciseImage } from '@/components/ui/ExerciseImage';
import { FormHeader } from '@/components/ui/FormHeader';
import { Input } from '@/components/ui/Input';
import { OptionCard } from '@/components/ui/OptionCard';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { touch } from '@/design/tokens';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { newId } from '@/lib/uuid';
import { useExerciseImageUri } from './exercise-image';
import { muscles, useExercises, useSaveExercise, type LogType, type Muscle } from './exercises';
import { pickSquareImage, uploadPrivateImage } from './pick-image';
import { goBack } from '@/lib/navigation';

const equipment = ['barbell', 'dumbbells', 'machine', 'cables', 'bodyweight', 'bands'] as const;
const logTypes: LogType[] = ['weight_reps', 'reps', 'time', 'distance_time'];

/** Create a new exercise or edit one of your own (`exerciseId`). */
export function ExerciseForm({ exerciseId }: { exerciseId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const barHeight = useActionBarHeight();
  const userId = useAuth((s) => s.userId);
  const exercises = useExercises();
  const save = useSaveExercise();
  const editing = exerciseId ? exercises.data?.find((e) => e.id === exerciseId) : undefined;

  const [id] = useState(() => exerciseId ?? newId());
  const [name, setName] = useState(editing?.name ?? '');
  const [logType, setLogType] = useState<LogType>(editing?.logType ?? 'weight_reps');
  const [primary, setPrimary] = useState<Muscle | null>(editing?.primaryMuscle ?? null);
  const [secondary, setSecondary] = useState<Muscle[]>(editing?.secondaryMuscles ?? []);
  const [gear, setGear] = useState<string | null>(editing?.equipment ?? null);
  const [newImageUri, setNewImageUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentImage = useExerciseImageUri(editing);

  const valid = name.trim().length > 0 && primary != null && gear != null;

  const chooseImage = async () => {
    const uri = await pickSquareImage();
    if (uri) setNewImageUri(uri);
  };

  const submit = async () => {
    if (!valid || !userId) return;
    setError(null);
    try {
      let imagePath: string | undefined;
      if (newImageUri)
        imagePath = await uploadPrivateImage(
          'user-exercise-images',
          userId,
          `${id}.jpg`,
          newImageUri,
        );
      await save.mutateAsync({
        id,
        name,
        primaryMuscle: primary!,
        secondaryMuscles: secondary,
        equipment: gear!,
        logType,
        imagePath,
      });
      goBack(router, '/train');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <Screen scroll bottomBarHeight={barHeight + 24} gap={22}>
        <FormHeader
          left={{ label: t('common.cancel'), onPress: () => goBack(router, '/train') }}
          title={editing ? t('exerciseForm.editTitle') : t('exerciseForm.newTitle')}
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('exerciseForm.addImage')}
            onPress={chooseImage}
            style={{
              minWidth: touch.minTarget,
              minHeight: touch.minTarget,
              justifyContent: 'center',
            }}
          >
            <ExerciseImage uri={newImageUri ?? currentImage} size={52} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Input
              label={t('exerciseForm.name')}
              value={name}
              onChangeText={setName}
              autoCapitalize="sentences"
              placeholder={t('exerciseForm.namePlaceholder')}
            />
          </View>
        </View>

        <View style={{ gap: 10 }} accessibilityRole="radiogroup">
          <Text variant="label" muted>
            {t('exerciseForm.whatYouLog')}
          </Text>
          {logTypes.map((lt) => (
            <OptionCard
              key={lt}
              title={t(`exerciseForm.logType.${lt}`)}
              description={t(`exerciseForm.logType.${lt}Example`)}
              selected={logType === lt}
              onPress={() => setLogType(lt)}
            />
          ))}
        </View>

        <ChipGroup
          legend={t('exerciseForm.primary')}
          value={primary}
          onChange={(m) => {
            setPrimary(m);
            setSecondary((s) => s.filter((x) => x !== m));
          }}
          options={muscles.map((m) => ({ value: m, label: t(`library.muscle.${m}`) }))}
        />
        <ChipGroup
          multiple
          legend={t('exerciseForm.secondary')}
          value={secondary}
          onChange={setSecondary}
          options={muscles
            .filter((m) => m !== primary)
            .map((m) => ({ value: m, label: t(`library.muscle.${m}`) }))}
        />
        <ChipGroup
          legend={t('exerciseForm.equipment')}
          value={gear}
          onChange={setGear}
          options={equipment.map((e) => ({ value: e, label: t(`exerciseForm.gear.${e}`) }))}
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
          label={t('exerciseForm.save')}
          disabled={!valid || save.isPending}
          onPress={submit}
        />
      </BottomActionBar>
    </>
  );
}
