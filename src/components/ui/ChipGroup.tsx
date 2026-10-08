import { View } from 'react-native';
import { Chip } from './Chip';
import { Text } from './Text';

export type ChipOption<T extends string> = { value: T; label: string };

type Common<T extends string> = {
  legend: string;
  options: readonly ChipOption<T>[];
};

export type ChipGroupProps<T extends string> =
  | (Common<T> & { multiple?: false; value: T | null; onChange: (value: T) => void })
  | (Common<T> & { multiple: true; value: readonly T[]; onChange: (value: T[]) => void });

/** A labelled set of chips: single choice (radio) or multi choice (checkbox). */
export function ChipGroup<T extends string>(props: ChipGroupProps<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={props.legend} style={{ gap: 10 }}>
      <Text variant="label" muted>
        {props.legend}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {props.options.map((o) => {
          if (props.multiple) {
            const selected = props.value.includes(o.value);
            return (
              <Chip
                key={o.value}
                label={o.label}
                selected={selected}
                onPress={() =>
                  props.onChange(
                    selected ? props.value.filter((v) => v !== o.value) : [...props.value, o.value],
                  )
                }
              />
            );
          }
          return (
            <Chip
              key={o.value}
              role="radio"
              label={o.label}
              selected={props.value === o.value}
              onPress={() => props.onChange(o.value)}
            />
          );
        })}
      </View>
    </View>
  );
}
