import '@/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ToastHost } from '@/components/ui/ToastHost';
import { useAppFonts } from '@/design/fonts';
import { color } from '@/design/tokens';
import { createQueryClient } from '@/lib/query-client';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const [queryClient] = useState(createQueryClient);
  const ready = fontsLoaded || fontError != null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      <ToastHost />
    </QueryClientProvider>
  );
}
