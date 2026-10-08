import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { useCreatePlan } from './plans';

/** Asks for a name, creates a draft plan and opens it. */
export function NewPlanSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const create = useCreatePlan();
  const [name, setName] = useState('');
  const valid = name.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    const id = await create.mutateAsync(name);
    setName('');
    onClose();
    router.push({ pathname: '/train/plan/[planId]', params: { planId: id } });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('train.newPlan')}
      closeLabel={t('common.close')}
      footer={
        <Button
          size="large"
          label={t('train.createPlan')}
          disabled={!valid || create.isPending}
          onPress={submit}
        />
      }
    >
      <Input
        label={t('train.planName')}
        value={name}
        onChangeText={setName}
        placeholder={t('train.planNamePlaceholder')}
        autoFocus
        onSubmitEditing={submit}
      />
      {create.isError ? (
        <Text variant="bodyS" danger accessibilityRole="alert">
          {create.error.message}
        </Text>
      ) : null}
    </Sheet>
  );
}
