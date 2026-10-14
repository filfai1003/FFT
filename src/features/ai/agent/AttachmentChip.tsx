import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/design/use-theme';
import { attachmentUrl, type Attachment } from './attachments';

/**
 * A photo or file of a coach message: the picture itself, or the file's name. `inverted` = inside
 * the user's dark bubble. With `onRemove`, it can be taken off before sending.
 */
export function AttachmentChip({
  attachment: a,
  inverted,
  onRemove,
}: {
  attachment: Attachment;
  inverted?: boolean;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const url = useQuery({
    queryKey: ['ai-attachment', a.id],
    enabled: a.kind === 'image',
    staleTime: Infinity,
    queryFn: () => attachmentUrl(a),
  });
  const fg = inverted ? colors.bg : colors.text;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: a.kind === 'image' ? 0 : 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: inverted ? colors.textMuted : colors.borderDecorative,
        overflow: 'hidden',
      }}
    >
      {a.kind === 'image' && url.data ? (
        <Image
          source={{ uri: url.data }}
          accessibilityLabel={a.name}
          style={{ width: 72, height: 72 }}
        />
      ) : (
        <>
          <Icon name={a.kind === 'image' ? 'image' : 'list'} size={16} color={fg} />
          <Text variant="label" numberOfLines={1} style={{ color: fg, maxWidth: 160 }}>
            {a.name}
          </Text>
        </>
      )}
      {onRemove ? (
        <IconButton
          icon="close"
          size={32}
          accessibilityLabel={t('ai.attachRemove', { name: a.name })}
          onPress={onRemove}
        />
      ) : null}
    </View>
  );
}
