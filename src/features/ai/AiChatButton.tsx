import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/IconButton';

/** The AI coach, one tap away from the headers of Today, Train and Diet. */
export function AiChatButton() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <IconButton
      icon="chat"
      accessibilityLabel={t('ai.openCoach')}
      onPress={() => router.push('/ai-chat')}
    />
  );
}
