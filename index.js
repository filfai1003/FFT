// App entry: Expo Router, plus the background task that draws the Android home screen widgets
// (DECISIONS 51). The widgets have to be registered here, outside React, because Android can ask
// for them while the app is closed.
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/features/widgets/task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
