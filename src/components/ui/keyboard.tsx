// Keyboard-aware building blocks (phones): the focused field is scrolled above the on-screen keyboard
// and fixed bars follow it. Android draws edge to edge, so the window no longer shrinks for the
// keyboard by itself. The web version (keyboard.web.tsx) uses the plain components.
export {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardProvider,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
