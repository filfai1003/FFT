import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { color } from '@/design/tokens';

// Temporary type specimen. Replaced by the component catalogue in step 0.15.
export default function Index() {
  return (
    <ScrollView
      style={{ backgroundColor: color.bg }}
      contentContainerStyle={{ padding: 20, gap: 12 }}
    >
      <Text variant="label" muted>
        THU OCT 08
      </Text>
      <Text variant="displayL">TODAY</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text variant="displayXL" numeric>
          1360
        </Text>
        <Text variant="label" muted>
          / 2350 kcal
        </Text>
      </View>
      <Text variant="titleM">Incline dumbbell press</Text>
      <Text variant="body">Body text in Space Grotesk 15.</Text>
      <Text variant="bodyS" muted>
        Small text, 13, muted.
      </Text>
    </ScrollView>
  );
}
