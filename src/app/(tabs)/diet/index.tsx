import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';

export default function DietScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('nav.diet')} />;
}
