import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import type { Macros } from '@/domain/diet';
import { macroKeys } from './summary';

/**
 * The three macros of a portion side by side, each with its colour dot and name (DECISIONS 107
 * colour code), instead of a "P 12 · C 30 · F 8" line to decode. Read as one sentence.
 */
export function MacroValues({ macros }: { macros: Pick<Macros, 'protein' | 'carbs' | 'fat'> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('diet.macroValues', {
        p: Math.round(macros.protein),
        c: Math.round(macros.carbs),
        f: Math.round(macros.fat),
      })}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 }}
    >
      {macroKeys.map((key) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.macroSplit[key],
            }}
          />
          <Text variant="body" semibold numeric>
            {t('diet.grams', { g: Math.round(macros[key]) })}
          </Text>
          <Text variant="bodyS" muted>
            {t(`diet.macro.${key}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}
