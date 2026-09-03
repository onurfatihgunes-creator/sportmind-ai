import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { HouseIcon, CompassIcon, LightningIcon, UserIcon } from 'phosphor-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '@/constants/theme';

const ICONS = { index: HouseIcon, explore: CompassIcon, insights: LightningIcon, profile: UserIcon } as const;

export default function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const routes = state.routes.filter((r) => ICONS[r.name as keyof typeof ICONS]);
  const activeIndex = routes.findIndex((r) => r.key === state.routes[state.index]?.key);
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (activeIndex >= 0) indicatorX.value = withTiming(activeIndex * 100, { duration: reduceMotion ? 0 : 320 });
  }, [activeIndex, reduceMotion]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${indicatorX.value}%` }],
  }));

  return (
    <View style={[styles.wrap, { height: 66 + insets.bottom, paddingBottom: insets.bottom }]}>
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.indicator, { width: `${100 / routes.length}%` }, indicatorStyle]} />
      {routes.map((route) => {
        const { options } = descriptors[route.key];
        const isFocused = state.routes[state.index]?.key === route.key;
        const Icon = ICONS[route.name as keyof typeof ICONS];
        const label = typeof options.title === 'string' ? options.title : route.name;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable key={route.key} onPress={onPress} style={styles.tab} hitSlop={4}>
            <Icon size={21} weight="bold" color={isFocused ? colors.tabActive : colors.tabInactive} />
            <Text style={[styles.label, { color: isFocused ? colors.tabActive : colors.tabInactive }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 2,
    backgroundColor: colors.primary,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 12,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
  },
});
