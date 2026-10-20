import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { create } from 'zustand';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconTile, useAreaColors, type Area } from '@/components/ui/IconTile';
import { Sheet } from '@/components/ui/Sheet';
import { useTabBarHeight } from '@/components/ui/TabBar';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { mealForHour } from '@/domain/diet';
import { useRecentFoods } from '@/features/diet/foods';
import { useAddWater, useRemoveWater } from '@/features/diet/log';
import { useToday } from '@/features/profile/use-today';
import { useSessionStore as useWorkout } from '@/features/session/store';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { confirm, tick } from '@/lib/haptics';
import { useToastStore } from '@/lib/toast-store';

/** Opened by the "+" in the middle of the tab bar. */
export const useAddSheet = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

type Tile = {
  key: string;
  label: string;
  icon: IconName;
  area: Area;
  run: () => void;
};

/** Add anything from anywhere: food, a scan, water, weight, a workout, a photo, or tell the coach. */
export function AddSheet() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const open = useAddSheet((s) => s.open);
  const setOpen = useAddSheet((s) => s.set);
  const today = useToday();
  const barHeight = useTabBarHeight();
  const glassMl = usePreferencesStore((s) => s.waterGlassMl);
  const addWater = useAddWater();
  const removeWater = useRemoveWater();
  const showToast = useToastStore((s) => s.show);
  const active = useWorkout((s) => s.active);
  const recent = useRecentFoods();
  const meal = mealForHour(new Date().getHours());

  const go = (href: Href) => {
    setOpen(false);
    router.push(href);
  };

  const tiles: Tile[] = [
    {
      key: 'food',
      label: t('add.food'),
      icon: 'search',
      area: 'nutrition',
      run: () => go({ pathname: '/food-search', params: { meal, day: today } }),
    },
    {
      key: 'scan',
      label: t('add.scan'),
      icon: 'barcode',
      area: 'nutrition',
      run: () => go({ pathname: '/scanner', params: { meal, day: today } }),
    },
    {
      key: 'water',
      label: t('add.water', { ml: glassMl }),
      icon: 'droplet',
      area: 'water',
      run: () => {
        setOpen(false);
        void addWater.mutateAsync({ day: today, ml: glassMl }).then((id) => {
          confirm();
          showToast({
            message: t('today.waterAdded'),
            actionLabel: t('common.undo'),
            bottomOffset: barHeight,
            onAction: () => removeWater.mutate(id),
          });
        });
      },
    },
    {
      key: 'body',
      label: t('add.body'),
      icon: 'scale',
      area: 'neutral',
      run: () => go('/check-in'),
    },
    {
      key: 'workout',
      label: active ? t('add.workoutResume') : t('add.workout'),
      icon: 'dumbbell',
      area: 'training',
      run: () =>
        go(
          active
            ? { pathname: '/session/[sessionId]', params: { sessionId: active.id } }
            : '/train',
        ),
    },
    {
      key: 'photo',
      label: t('add.photo'),
      icon: 'camera',
      area: 'neutral',
      run: () => go('/progress/photos'),
    },
  ];

  const foods = (recent.data ?? []).slice(0, 3);

  return (
    <Sheet
      visible={open}
      onClose={() => setOpen(false)}
      title={t('add.title')}
      closeLabel={t('common.close')}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((tile) => (
          <AddTile key={tile.key} tile={tile} />
        ))}
      </View>

      {foods.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text variant="titleM">{t('add.again')}</Text>
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.borderDecorative,
              backgroundColor: colors.surface,
              paddingHorizontal: 14,
            }}
          >
            {foods.map((f, i) => (
              <Pressable
                key={f.id}
                accessibilityRole="button"
                accessibilityLabel={t('add.againFood', { name: f.name })}
                onPress={() =>
                  go({ pathname: '/food/[foodId]', params: { foodId: f.id, meal, day: today } })
                }
                style={({ pressed }) => ({
                  minHeight: 56,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.divider,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <IconTile icon="bowl" area="nutrition" size={36} />
                <View style={{ flex: 1 }}>
                  <Text medium numberOfLines={1}>
                    {f.name}
                  </Text>
                  <Text variant="bodyS" muted>
                    {t('add.per100', {
                      kcal: Math.round(f.per100.kcal),
                      p: Math.round(f.per100.protein),
                    })}
                  </Text>
                </View>
                <View
                  aria-hidden
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.text,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="plus" size={18} color={colors.bg} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('add.coach')}
        onPress={() => go('/ai-chat')}
        style={({ pressed }) => ({
          minHeight: 50,
          borderRadius: 25,
          borderWidth: 1,
          borderColor: colors.borderControl,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Icon name="sparkle" size={20} color={colors.textMuted} />
        <Text muted style={{ flex: 1 }}>
          {t('add.coach')}
        </Text>
      </Pressable>
    </Sheet>
  );
}

/**
 * One way to add something: a tile in its area's soft colour (colour code, DECISIONS 107), the
 * icon on a light square and the label in the area's ink.
 */
function AddTile({ tile }: { tile: Tile }) {
  const { colors } = useTheme();
  const c = useAreaColors(tile.area);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      onPress={() => {
        tick();
        tile.run();
      }}
      style={({ pressed }) => ({
        width: '31%',
        flexGrow: 1,
        minHeight: 100,
        borderRadius: 18,
        backgroundColor: c.soft,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={tile.icon} size={21} color={c.ink} />
      </View>
      <Text variant="bodyS" semibold style={{ textAlign: 'center', color: c.ink }}>
        {tile.label}
      </Text>
    </Pressable>
  );
}
