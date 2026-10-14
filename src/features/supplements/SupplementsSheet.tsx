import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useTheme } from '@/design/use-theme';
import { useToastStore } from '@/lib/toast-store';
import {
  useSaveSupplement,
  useSetSupplementDeleted,
  useSetTaken,
  useSupplementLogs,
  useSupplements,
} from './data';

/**
 * The user's supplements: add one (name, dose), remove one (with UNDO) and, with a `day`, tick
 * what was taken that day.
 */
export function SupplementsSheet({
  visible,
  onClose,
  day,
}: {
  visible: boolean;
  onClose: () => void;
  day?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const supplements = useSupplements();
  const taken = useSupplementLogs(day ?? '', day ?? '').data?.get(day ?? '');
  const setTaken = useSetTaken();
  const save = useSaveSupplement();
  const setDeleted = useSetSupplementDeleted();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const list = supplements.data ?? [];

  const add = async () => {
    await save.mutateAsync({ name, dose, position: list.length });
    setName('');
    setDose('');
  };

  const remove = (id: string, label: string) =>
    setDeleted.mutate(
      { id, deleted: true },
      {
        onSuccess: () =>
          showToast({
            message: t('calendar.supplementRemoved', { name: label }),
            actionLabel: t('common.undo'),
            onAction: () => setDeleted.mutate({ id, deleted: false }),
          }),
      },
    );

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('calendar.supplements')}
      closeLabel={t('common.close')}
      footer={
        <Button
          size="large"
          icon="plus"
          label={t('calendar.addSupplement')}
          disabled={name.trim() === '' || save.isPending}
          onPress={() => void add()}
        />
      }
    >
      {list.length ? (
        <View>
          {list.map((s, i) => {
            const label = s.dose ? `${s.name} · ${s.dose}` : s.name;
            return (
              <View
                key={s.id}
                style={{
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderColor: colors.borderDecorative,
                }}
              >
                <Text style={{ flex: 1 }}>{label}</Text>
                <IconButton
                  icon="trash"
                  size={36}
                  accessibilityLabel={t('calendar.supplementRemove', { name: s.name })}
                  onPress={() => remove(s.id, s.name)}
                />
                {day ? (
                  <Toggle
                    value={taken?.has(s.id) ?? false}
                    accessibilityLabel={label}
                    onValueChange={(v) => setTaken.mutate({ day, supplementId: s.id, taken: v })}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <Input
        label={t('calendar.supplementName')}
        placeholder={t('calendar.supplementNameHint')}
        value={name}
        onChangeText={setName}
        maxLength={60}
      />
      <Input
        label={t('calendar.supplementDose')}
        placeholder={t('calendar.supplementDoseHint')}
        value={dose}
        onChangeText={setDose}
        maxLength={40}
        onSubmitEditing={() => name.trim() && void add()}
      />
    </Sheet>
  );
}
