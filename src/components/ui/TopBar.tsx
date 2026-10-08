import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from './IconButton';
import type { IconName } from './Icon';

export type TopBarProps = {
  /** Round back button (pushed consultation screens). */
  onBack?: () => void;
  backLabel?: string;
  backIcon?: IconName;
  /** Right side: usually an IconButton ("More options", "New plan"…). */
  right?: ReactNode;
};

/** Top row of pushed screens: round back button on the left, round action on the right. */
export function TopBar({ onBack, backLabel, backIcon = 'chevronLeft', right }: TopBarProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {onBack ? (
        <IconButton icon={backIcon} accessibilityLabel={backLabel ?? ''} onPress={onBack} />
      ) : (
        <View />
      )}
      {right ?? <View />}
    </View>
  );
}
