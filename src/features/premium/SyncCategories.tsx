import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { IconName } from '@/components/ui/Icon';
import { IconTile, type Area } from '@/components/ui/IconTile';
import { Text } from '@/components/ui/Text';
import { ToggleRow } from '@/components/ui/ToggleRow';
import { useTheme } from '@/design/use-theme';
import { DATA_CATEGORIES, type DataCategory } from '@/domain/data-categories';

/** Each category's tile (canvas "Your data"): diet teal, training purple, the rest neutral. */
const CATEGORY_LOOK: Record<DataCategory, { icon: IconName; area: Area }> = {
  body: { icon: 'scale', area: 'neutral' },
  diet: { icon: 'bowl', area: 'nutrition' },
  training: { icon: 'dumbbell', area: 'training' },
  photos: { icon: 'camera', area: 'neutral' },
};

/**
 * What leaves the phone, by category (DECISIONS 63): one row per category with its tile, what it
 * holds and a switch (the whole row toggles), then what always goes (profile, settings,
 * consents). `readOnly` shows the state only (the web app: the choice is made in the phone app).
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
        const detail = t(`serverCopy.categoryDetail.${c}`);
        const look = CATEGORY_LOOK[c];
        if (!readOnly)
          return (
            <ToggleRow
              key={c}
              name={title}
              detail={detail}
              value={on}
              onValueChange={(v) => onToggle(c, v)}
              icon={look.icon}
              area={look.area}
              divider={i > 0}
            />
          );
        return (
          <View
            key={c}
            style={{
              minHeight: 60,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderTopWidth: i > 0 ? 1 : 0,
              borderColor: colors.borderDecorative,
            }}
          >
            <IconTile icon={look.icon} area={look.area} size={36} />
            <View style={{ flex: 1, gap: 2, paddingVertical: 8 }}>
              <Text variant="body">{title}</Text>
              <Text variant="bodyS" muted>
                {detail}
              </Text>
            </View>
            <Text variant="bodyS" muted>
              {on ? t('serverCopy.categoryKept') : t('serverCopy.categoryNotKept')}
            </Text>
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
