import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { colors } from '@/constants/theme';
import { initI18n } from '@/i18n';
import { DataProvider } from '@/contexts/DataContext';
import { WatchlistProvider } from '@/contexts/WatchlistContext';
import { ProfileProvider } from '@/contexts/ProfileContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.primary,
    text: colors.textPrimary,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Sora_600SemiBold,
    Sora_700Bold,
  });
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
  }, []);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded && i18nReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, i18nReady]);

  if (!fontsLoaded || !i18nReady) {
    return null;
  }

  return (
    <ThemeProvider value={navTheme}>
      <DataProvider>
        <WatchlistProvider>
          <ProfileProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding/index" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="match/[id]" />
              <Stack.Screen name="team/[id]" />
              <Stack.Screen name="batch-analysis" />
              <Stack.Screen name="my-matches" />
              <Stack.Screen name="explainability/[id]" />
              <Stack.Screen name="team-comparison" />
              <Stack.Screen name="player-impact/[id]" />
              <Stack.Screen name="what-changed/[id]" />
              <Stack.Screen name="legal/index" />
              <Stack.Screen name="legal/methodology" />
              <Stack.Screen name="language" />
            </Stack>
          </ProfileProvider>
        </WatchlistProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
