import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AppTabBar from '@/components/AppTabBar';
import { PREMIUM_ENABLED } from '@/constants/theme';

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
      <Tabs.Screen name="premium" options={{ title: t('tabs.premium'), href: PREMIUM_ENABLED ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
