import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { DATA_CATEGORIES, type DataCategory } from '@/domain/data-categories';

/**
 * What leaves the phone, by category (DECISIONS 63): one row per category with what it holds and
 * a switch, then what always goes (profile, settings, consents). `readOnly` shows the state only
 * (the web app: the choice is made in the phone app).
 */
export function SyncCategoryList({
  value,
  onToggle,
  readOnly = false,
  alwaysNote = 'copy',
}: {
  value: readonly DataCategory[];
  onToggle: (category: DataCategory, on: boolean) => void;
  readOnly?: boolean;
  /** What always goes: into the copy on the server, or to the paired phones (DECISIONS 65). */
  alwaysNote?: 'copy' | 'relay';
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 0 }}>
      {DATA_CATEGORIES.map((c, i) => {
        const on = value.includes(c);
        const title = t(`serverCopy.category.${c}`);
        return (
          <View
            key={c}
            style={{
              minHeight: 60,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderTopWidth: i > 0 ? 1 : 0,
              borderColor: colors.borderDecorative,
            }}
          >
            <View style={{ flex: 1, gap: 2, paddingVertical: 8 }}>
              <Text variant="bodyS">{title}</Text>
              <Text variant="bodyS" muted>
                {t(`serverCopy.categoryDetail.${c}`)}
              </Text>
            </View>
            {readOnly ? (
              <Text variant="bodyS" muted>
                {on ? t('serverCopy.categoryKept') : t('serverCopy.categoryNotKept')}
              </Text>
            ) : (
              <Toggle value={on} onValueChange={(v) => onToggle(c, v)} accessibilityLabel={title} />
            )}
          </View>
        );
      })}
      <Text variant="bodyS" muted style={{ paddingTop: 8 }}>
        {alwaysNote === 'relay' ? t('relay.alwaysSent') : t('serverCopy.alwaysSent')}
      </Text>
    </View>
  );
}

/** A list with one category more or less (kept in the usual order). */
export function toggled(
  list: readonly DataCategory[],
  category: DataCategory,
  on: boolean,
): DataCategory[] {
  return DATA_CATEGORIES.filter((c) => (c === category ? on : list.includes(c)));
}
