import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppTabBar from '@/components/AppTabBar';

export default function TabLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
      <Tabs.Screen name="explore" options={{ title: t('tabs.explore') }} />
      <Tabs.Screen name="insights" options={{ title: t('tabs.insights') }} />
      {/* The paywall is reached from Profile's Pro row, Home's header pill, and the
          Pro-required state on Match Analysis — never from the tab bar itself, the
          same shape Stylist's own /pro screen has (a pushed screen, not a tab). Kept
          under (tabs) only so router.push('/(tabs)/premium') keeps working. */}
      <Tabs.Screen name="premium" options={{ title: t('tabs.premium'), href: null }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
