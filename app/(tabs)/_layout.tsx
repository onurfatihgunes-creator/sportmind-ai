import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import { colors, fonts } from '@/constants/theme';

function TabIcon({ name, color }: { name: React.ComponentProps<typeof Feather>['name']; color: string }) {
  return <Feather name={name} size={22} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 10 },
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon name="home" color={color} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: 'Explore', tabBarIcon: ({ color }) => <TabIcon name="compass" color={color} /> }}
      />
      <Tabs.Screen
        name="insights"
        options={{ title: 'AI Insights', tabBarIcon: ({ color }) => <TabIcon name="zap" color={color} /> }}
      />
      <Tabs.Screen
        name="premium"
        options={{ title: 'Premium', tabBarIcon: ({ color }) => <TabIcon name="award" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon name="user" color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderTopColor: 'rgba(255,255,255,0.06)',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 84,
    paddingTop: 8,
  },
});
