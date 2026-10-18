import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { Avatar } from '@/features/gamification/components';
import { useProgressView } from '@/features/gamification/progress-view';
import { tick } from '@/lib/haptics';
import { useCommunityAvailable, useCommunityMe, useFriends } from './api';

/** Profile (canvas Profile): friends and "See how others see you", or the way to join. */
export function ProfileCommunityCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const available = useCommunityAvailable();
  const me = useCommunityMe();
  const friends = useFriends(null, me.data != null);
  if (!available || me.isPending || me.isError) return null;

  const row = (icon: 'eye' | 'users', title: string, info: string, onPress: () => void) => (
    <Card
      onPress={() => {
        tick();
        onPress();
      }}
      accessibilityLabel={`${title}. ${info}`}
      gap={12}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 0, minHeight: 60 }}
    >
      <Icon name={icon} size={20} color={colors.text} />
      <View style={{ flex: 1 }}>
        <Text medium>{title}</Text>
        <Text variant="bodyS" muted>
          {info}
        </Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textPlaceholderIcon} />
    </Card>
  );

  if (!me.data)
    return row(
      'users',
      t('community.profileCard.join'),
      t('community.profileCard.joinInfo'),
      () => {
        useProgressView.getState().setView('community');
        router.push('/progress');
      },
    );

  const accepted = (friends.data ?? []).filter((f) => f.status === 'friends');
  const names = accepted.map((f) => f.name);
  // "Marta", "Marta and Luca", "Marta, Luca and Sam"; more are counted in the title.
  const shown = names.slice(0, 3);
  const list =
    shown.length === 0
      ? t('community.friends.none')
      : shown.length === 1
        ? shown[0]!
        : t('community.friends.and', {
            list: shown.slice(0, -1).join(', '),
            last: shown[shown.length - 1],
          });
  const openCommunity = () => {
    useProgressView.getState().setView('community');
    router.push('/progress');
  };
  return (
    <>
      <Card gap={12} style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {accepted.length > 0 ? (
            <View aria-hidden style={{ flexDirection: 'row' }}>
              {accepted.slice(0, 3).map((f, i) => (
                <View
                  key={f.public_id}
                  style={{
                    marginLeft: i === 0 ? 0 : -10,
                    borderRadius: 19,
                    borderWidth: 2,
                    borderColor: colors.surface,
                  }}
                >
                  <Avatar name={f.name} size={34} />
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text semibold>{t('community.friends.count', { count: accepted.length })}</Text>
            <Text variant="bodyS" muted numberOfLines={1}>
              {list}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('community.friends.seeFriends')}
            onPress={() => {
              tick();
              openCommunity();
            }}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="chevronRight" size={18} color={colors.textPlaceholderIcon} />
          </Pressable>
        </View>
      </Card>
      {row('eye', t('community.profileCard.seeHow'), t('community.profileCard.seeHowInfo'), () =>
        router.push('/progress/community-profile'),
      )}
    </>
  );
}
