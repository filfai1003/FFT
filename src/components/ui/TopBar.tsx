import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton, IconButtonLookContext } from './IconButton';
import type { IconName } from './Icon';

export type TopBarProps = {
  /** Back button (pushed consultation screens). */
  onBack?: () => void;
  backLabel?: string;
  backIcon?: IconName;
  /** Right side: usually an IconButton ("More options", "New plan"…). */
  right?: ReactNode;
};

/**
 * Top row of pushed screens, as in the canvas: the bare back (or close) icon on the left, actions
 * on the right; the page title goes under it. Icon buttons inside it drop their round border.
 */
export function TopBar({ onBack, backLabel, backIcon = 'chevronLeft', right }: TopBarProps) {
  return (
    <IconButtonLookContext.Provider value="plain">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          // The canvas puts the 44px targets 12px from the screen edge (content: 16px).
          marginHorizontal: -4,
          marginBottom: -6,
        }}
      >
        {onBack ? (
          <IconButton icon={backIcon} accessibilityLabel={backLabel ?? ''} onPress={onBack} />
        ) : (
          <View />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>{right}</View>
      </View>
    </IconButtonLookContext.Provider>
  );
}
