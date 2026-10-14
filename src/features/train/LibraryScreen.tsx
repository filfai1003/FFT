import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { ExerciseBrowser } from './ExerciseBrowser';
import { goBack } from '@/lib/navigation';

export function LibraryScreen({
  exerciseRoute,
}: {
  exerciseRoute: '/train/exercise/[exerciseId]' | '/progress/exercise/[exerciseId]';
}) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen gap={14} style={{ paddingBottom: 0 }}>
      <TopBar
        onBack={() =>
          goBack(router, exerciseRoute.startsWith('/progress') ? '/progress' : '/train')
        }
        backLabel={t('common.back')}
        right={
          <IconButton
            icon="plus"
            accessibilityLabel={t('library.create')}
            onPress={() => router.push('/exercise/new')}
          />
        }
      />
      <Text variant="screenTitle">{t('library.title')}</Text>
      <ExerciseBrowser
        mode="browse"
        searchLabel={t('library.search')}
        onOpen={(e) => router.push({ pathname: exerciseRoute, params: { exerciseId: e.id } })}
      />
    </Screen>
  );
}
