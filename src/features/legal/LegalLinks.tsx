import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { openLegal, type LegalPage } from '@/lib/legal';

const LABELS = {
  privacy: 'legal.privacy',
  terms: 'legal.terms',
  deleteAccount: 'legal.deleteAccount',
} as const satisfies Record<LegalPage, string>;

/** Plain text buttons (44+ px) that open the legal pages of the install site in the browser. */
export function LegalLinks({ pages }: { pages: LegalPage[] }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 }}>
      {pages.map((page) => (
        <Button
          key={page}
          label={t(LABELS[page])}
          variant="ghost"
          block={false}
          onPress={() => openLegal(page)}
        />
      ))}
    </View>
  );
}
