import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/components/ui/PlaceholderScreen';

export default function TrainScreen() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('nav.train')} />;
}
