import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { shortDateLabel } from '@/domain/day';
import { AI_DOCK_HEIGHT, AiDock } from '@/features/ai/AiDock';
import { useToday } from '@/features/profile/use-today';
import { ActiveSessionBanner } from '@/features/session/ActiveSessionBanner';
import { Reveal } from '@/components/ui/motion';
import { NextUpCard } from './NextUpCard';
import { CustomizeSheet } from './CustomizeSheet';
import { useCreatine } from './creatine-store';
import { useHomeLayout } from './layout-store';
import { widgetComponents } from './Widgets';

const WIDGET_GAP = 10;

/** Today: the widgets you chose (calories and meals, workout, water, creatine, calendar) and the AI bar. */
export function TodayScreen() {
  const { t } = useTranslation();
  const today = useToday();
  const { widgets, aiDock, loaded, load } = useHomeLayout();
  const creatineLoaded = useCreatine((s) => s.loaded);
  const loadCreatine = useCreatine((s) => s.load);
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    if (!loaded) void load();
    if (!creatineLoaded) void loadCreatine();
  }, [loaded, load, creatineLoaded, loadCreatine]);

  const [width, setWidth] = useState(0);
  // Two small widgets side by side leave the same gap as the rows above and below.
  const half = width > 0 ? (width - WIDGET_GAP) / 2 : '48%';
  const shown = widgets.filter((w) => w.visible);

  return (
    <>
      <Screen scroll bottomBarHeight={aiDock ? AI_DOCK_HEIGHT + 8 : 24} gap={16}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 4 }}>
            <Text variant="label" muted>
              {shortDateLabel(today)}
            </Text>
            <Text variant="displayL">{t('today.title')}</Text>
          </View>
          <IconButton
            icon="sliders"
            accessibilityLabel={t('today.customize')}
            onPress={() => setCustomizing(true)}
          />
        </View>

        <ActiveSessionBanner />
        <Reveal>
          <NextUpCard />
        </Reveal>

        <View
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: WIDGET_GAP }}
        >
          {shown.map((w, n) => {
            const Widget = widgetComponents[w.id];
            return (
              <View
                key={w.id}
                style={{ width: w.size === 'large' ? '100%' : half, flexDirection: 'column' }}
              >
                <Reveal index={n + 1} style={{ flexGrow: 1 }}>
                  <Widget size={w.size} />
                </Reveal>
              </View>
            );
          })}
        </View>
        {shown.length === 0 ? <Text muted>{t('today.empty')}</Text> : null}
      </Screen>

      {aiDock ? <AiDock /> : null}
      <CustomizeSheet visible={customizing} onClose={() => setCustomizing(false)} />
    </>
  );
}
