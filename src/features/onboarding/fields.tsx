import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import type { Sex } from '@/domain/nutrition';

/** Sex for the calorie formula, optional: "Not set" clears it (DECISIONS 103). */
export function SexChips({
  value,
  onChange,
}: {
  value: Sex | null;
  onChange: (v: Sex | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <ChipGroup
      legend={t('onboarding.body.sexOptional')}
      value={value ?? 'none'}
      onChange={(v) => onChange(v === 'none' ? null : v)}
      options={[
        { value: 'male', label: t('onboarding.body.male') },
        { value: 'female', label: t('onboarding.body.female') },
        { value: 'none', label: t('onboarding.body.notSet') },
      ]}
    />
  );
}

/** A yes/no row with a title and a help line: consents and the "I am 18 or older" confirmation. */
export function ConsentRow(props: {
  title: string;
  detail: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 8,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text>{props.title}</Text>
        <Text variant="bodyS" semibold muted>
          {props.detail}
        </Text>
      </View>
      <Toggle
        value={props.value}
        onValueChange={props.onValueChange}
        accessibilityLabel={props.title}
      />
    </View>
  );
}
