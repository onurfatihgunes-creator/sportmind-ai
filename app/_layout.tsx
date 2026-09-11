import { DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import 'react-native-reanimated';
import { fonts, spacing } from '@/constants/theme';
import { initI18n } from '@/i18n';
import { isMissingProductionConfig } from '@/lib/supabase';
import { DataProvider } from '@/contexts/DataContext';
import { WatchlistProvider } from '@/contexts/WatchlistContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { FollowedTeamsProvider } from '@/contexts/FollowedTeamsContext';
import { EntitlementProvider } from '@/contexts/EntitlementContext';
import { AppThemeProvider, useAppTheme } from '@/contexts/ThemeContext';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const HAS_SEEN_WELCOME_KEY = 'sportmind_has_seen_welcome';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // AppThemeProvider has to wrap everything below it (including the
  // isMissingProductionConfig early-return branch, which still renders real themed UI,
  // not a bare unstyled screen) — see RootLayoutInner for the part of this tree that
  // actually reads the theme.
  return (
    <AppThemeProvider>
      <RootLayoutInner />
    </AppThemeProvider>
  );
}

function RootLayoutInner() {
  const { scheme, colors } = useAppTheme();
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

  // Recomputed whenever the resolved scheme/colors change — this is the ONE place
  // React Navigation's own chrome (header/tab-bar defaults, focused-route background)
  // gets its colors from, so it never lags a Light/Dark switch the rest of the app
  // already applied.
  const navTheme = useMemo(
    () => ({
      ...(scheme === 'dark' ? NavDarkTheme : NavDefaultTheme),
      colors: {
        ...(scheme === 'dark' ? NavDarkTheme.colors : NavDefaultTheme.colors),
        background: colors.background,
        card: colors.surface,
        border: colors.border,
        primary: colors.primary,
        text: colors.textPrimary,
      },
    }),
    [scheme, colors],
  );

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!ready) {
    return null;
  }

  // A real production/preview build missing its Supabase configuration must never
  // silently render the app on mock data as if it were live — see
  // lib/supabase.ts's isMissingProductionConfig for why this can only ever be true
  // outside `expo start`. Renders instead of the whole app (not just a banner) so no
  // screen ever gets a chance to quietly stand mock data in for a real backend.
  if (isMissingProductionConfig) {
    return (
      <NavigationThemeProvider value={navTheme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ConfigurationErrorScreen styles={styles} />
      </NavigationThemeProvider>
    );
  }

  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <DataProvider>
        <WatchlistProvider>
          <FollowedTeamsProvider>
            <ProfileProvider>
              <EntitlementProvider>
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
                  <Stack.Screen name="team-insights/[teamId]" />
                  <Stack.Screen name="my-matches" />
                  <Stack.Screen name="notifications" />
                  <Stack.Screen name="team-comparison" />
                  <Stack.Screen name="legal/index" />
                  <Stack.Screen name="legal/methodology" />
                  <Stack.Screen name="language" />
                  <Stack.Screen name="appearance" />
                </Stack>
              </EntitlementProvider>
            </ProfileProvider>
          </FollowedTeamsProvider>
        </WatchlistProvider>
      </DataProvider>
    </NavigationThemeProvider>
  );
}

function ConfigurationErrorScreen({ styles }: { styles: ReturnType<typeof createStyles> }) {
  const { t } = useTranslation();
  return (
    <View style={styles.configErrorWrap}>
      <Text style={styles.configErrorTitle}>{t('configError.title')}</Text>
      <Text style={styles.configErrorBody}>{t('configError.body')}</Text>
    </View>
  );
}

const createStyles = (colors: import('@/constants/theme').ThemeColors) =>
  StyleSheet.create({
    configErrorWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.background,
      gap: 8,
    },
    configErrorTitle: { fontFamily: fonts.headline, fontSize: 18, color: colors.textPrimary, textAlign: 'center' },
    configErrorBody: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textFaint, textAlign: 'center', maxWidth: 300 },
  });
