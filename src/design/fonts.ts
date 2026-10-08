import { Doto_800ExtraBold } from '@expo-google-fonts/doto';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { useFonts } from 'expo-font';
import { fontFamily } from './tokens';

/** Keys must equal the names in `fontFamily` (tokens.ts). */
export const fontAssets = {
  [fontFamily.display]: Doto_800ExtraBold,
  [fontFamily.label]: SpaceMono_400Regular,
  [fontFamily.labelBold]: SpaceMono_700Bold,
  [fontFamily.body]: SpaceGrotesk_400Regular,
  [fontFamily.bodyMedium]: SpaceGrotesk_500Medium,
  [fontFamily.bodySemiBold]: SpaceGrotesk_600SemiBold,
  [fontFamily.bodyBold]: SpaceGrotesk_700Bold,
};

/** Returns [loaded, error]. */
export function useAppFonts() {
  return useFonts(fontAssets);
}
