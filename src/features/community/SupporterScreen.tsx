import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/design/use-theme';
import { Avatar } from '@/features/gamification/components';
import { useProfile } from '@/features/profile/api';
import { goBack } from '@/lib/navigation';

const extras: { key: 'filters' | 'history' | 'badge' | 'cosmetics'; icon: IconName }[] = [
  { key: 'filters', icon: 'filter' },
  { key: 'history', icon: 'chart' },
  { key: 'badge', icon: 'star' },
  { key: 'cosmetics', icon: 'user' },
];

/**
 * What Supporter will add (canvas Supporter). Not for sale: the price says "Coming soon" and
 * nothing here can be bought (DECISIONS 90). Everything competitive stays free.
 */
export function SupporterScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const name = useProfile().data?.name ?? '';
  // Frame colours are a preview of a cosmetic, taken from the palette's chart colours.
  const frames = [
    { key: 'black', color: colors.dotOn },
    { key: 'blue', color: colors.macroSplit.protein },
    { key: 'green', color: colors.success },
    { key: 'orange', color: colors.warning },
  ] as const;

  return (
    <Screen scroll bottomBarHeight={24} gap={14}>
      <TopBar onBack={() => goBack(router, '/progress')} backLabel={t('common.back')} />
      <View style={{ gap: 10 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.dotOn,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="star" size={28} color={colors.surface} />
        </View>
        <Text variant="screenTitle" accessibilityRole="header">
          {t('community.supporter.title')}
        </Text>
        <Text style={{ color: colors.textMuted }}>{t('community.supporter.intro')}</Text>
      </View>

      <Card gap={0} style={{ paddingVertical: 4, paddingHorizontal: 14 }}>
        <Text semibold style={{ paddingTop: 12, paddingBottom: 4 }} accessibilityRole="header">
          {t('community.supporter.freeTitle')}
        </Text>
        {(['boards', 'badges', 'friends', 'profile'] as const).map((k, i) => (
          <View
            key={k}
            style={{
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.divider,
            }}
          >
            <Icon name="check" size={18} color={colors.successText} />
            <Text style={{ flex: 1 }}>{t(`community.supporter.free.${k}`)}</Text>
          </View>
        ))}
      </Card>

      <Card selected gap={0} style={{ paddingTop: 4, paddingHorizontal: 14, paddingBottom: 14 }}>
        <Text semibold style={{ paddingTop: 12, paddingBottom: 4 }} accessibilityRole="header">
          {t('community.supporter.addsTitle')}
        </Text>
        {extras.map((e, i) => (
          <View
            key={e.key}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              paddingVertical: 10,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.divider,
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={e.icon} size={17} color={colors.text} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text semibold>{t(`community.supporter.extras.${e.key}`)}</Text>
              <Text variant="bodyS" muted>
                {t(`community.supporter.extras.${e.key}Info`)}
              </Text>
            </View>
          </View>
        ))}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderTopWidth: 1,
            borderTopColor: colors.divider,
            paddingTop: 12,
          }}
        >
          <Text variant="bodyS" muted style={{ flex: 1 }}>
            {t('community.supporter.framePreview')}
          </Text>
          {frames.map((f) => (
            <View
              key={f.key}
              accessible
              accessibilityRole="image"
              accessibilityLabel={t(`community.supporter.frames.${f.key}`)}
              style={{ borderRadius: 18, borderWidth: 3, borderColor: f.color }}
            >
              <Avatar name={name || '?'} size={30} />
            </View>
          ))}
        </View>
      </Card>

      <Card
        style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingVertical: 0 }}
        gap={12}
      >
        <Text style={{ flex: 1 }}>{t('community.supporter.price')}</Text>
        <Text semibold>{t('community.supporter.comingSoon')}</Text>
      </Card>
      <Text variant="bodyS" muted style={{ textAlign: 'center' }}>
        {t('community.supporter.noPurchase')}
      </Text>
    </Screen>
  );
}
