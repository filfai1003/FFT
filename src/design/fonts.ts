import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';
import { useFonts } from 'expo-font';

/** Keys must equal the names used in `fontFamily` (tokens.ts). */
export const fontAssets = {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
};

/** Returns [loaded, error]. */
export function useAppFonts() {
  return useFonts(fontAssets);
}
