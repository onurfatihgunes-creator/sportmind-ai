import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { colors } from '@/constants/theme';
import { initI18n } from '@/i18n';
import { DataProvider } from '@/contexts/DataContext';
import { WatchlistProvider } from '@/contexts/WatchlistContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { FollowedTeamsProvider } from '@/contexts/FollowedTeamsContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const HAS_SEEN_WELCOME_KEY = 'sportmind_has_seen_welcome';

SplashScreen.preventAutoHideAsync();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
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
    Inter_700Bold,
  });
  const [i18nReady, setI18nReady] = useState(false);
  const [hasSeenWelcome, setHasSeenWelcome] = useState<boolean | null>(null);

  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
    AsyncStorage.getItem(HAS_SEEN_WELCOME_KEY).then((value) => setHasSeenWelcome(value === 'true'));
  }, []);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  const ready = fontsLoaded && i18nReady && hasSeenWelcome !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
      if (!hasSeenWelcome) router.replace('/welcome');
    }
  }, [ready, hasSeenWelcome]);

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider value={navTheme}>
      <DataProvider>
        <WatchlistProvider>
          <FollowedTeamsProvider>
            <ProfileProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal' }} />
                <Stack.Screen name="match/[id]" />
                <Stack.Screen name="team/[id]" />
                <Stack.Screen name="my-matches" />
                <Stack.Screen name="team-comparison" />
                <Stack.Screen name="legal/index" />
                <Stack.Screen name="legal/methodology" />
                <Stack.Screen name="language" />
              </Stack>
            </ProfileProvider>
          </FollowedTeamsProvider>
        </WatchlistProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
