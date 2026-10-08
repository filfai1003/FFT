import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';

export default function ProfileScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('nav.profile')} />;
}
