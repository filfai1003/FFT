import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useProfile, useUpdateProfile } from '@/features/profile/api';
import { useToastStore } from '@/lib/toast-store';
import { useCommunityMe, useSetCommunityName } from './api';

/**
 * Changes the PROFILE name (the community shows the profile name, DECISIONS 90): the member's
 * name on the server follows at once, with an undo.
 */
export function NameSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const profile = useProfile();
  const update = useUpdateProfile();
  const me = useCommunityMe();
  const setName = useSetCommunityName();
  const showToast = useToastStore((s) => s.show);
  const current = profile.data?.name ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? current;
  const valid = value.trim().length > 0 && value.trim().length <= 40;

  const apply = async (name: string) => {
    await update.mutateAsync({ name });
    if (me.data) await setName.mutateAsync(name).catch(() => undefined);
  };
  const save = async () => {
    const before = current;
    const name = value.trim().replace(/\s+/g, ' ');
    await apply(name);
    setDraft(null);
    onClose();
    showToast({
      message: t('community.name.saved'),
      actionLabel: t('common.undo'),
      onAction: () => void apply(before),
    });
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setDraft(null);
        onClose();
      }}
      title={t('community.name.title')}
      closeLabel={t('common.close')}
      footer={
        <Button
          size="large"
          label={t('community.name.save')}
          disabled={!valid || update.isPending}
          onPress={() => void save()}
        />
      }
    >
      <Input
        label={t('community.name.label')}
        value={value}
        onChangeText={setDraft}
        maxLength={40}
        autoCapitalize="words"
        autoFocus
      />
      <Text variant="bodyS" muted>
        {t('community.join.changeInfo')}
      </Text>
    </Sheet>
  );
}
