import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { HouseIcon, CompassIcon, LightningIcon, UserIcon } from 'phosphor-react-native';
import { useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { fonts, type ThemeColors } from '@/constants/theme';
import { NAV_RAIL_WIDTH } from '@/constants/layout';
import { isRTLLayout, useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { useAppTheme } from '@/contexts/ThemeContext';

const ICONS = { index: HouseIcon, explore: CompassIcon, insights: LightningIcon, profile: UserIcon } as const;

/** Rail items keep a fixed height and stack from the top, the way a sidebar does — spread
 *  evenly down an 840pt display they read as four unrelated buttons rather than one group. */
const RAIL_ITEM_HEIGHT = 64;

/**
 * The same tab bar in two postures. On a wide window (iPhone Duo's inner display, or a
 * Split View slice big enough for the two-pane layout) it becomes a vertical rail on the
 * leading edge, which is where iOS 27 itself moves navigation on that device and which
 * gives the content back the ~66pt strip a bottom bar costs on a display that is already
 * as wide as it is tall.
 *
 * This is still expo-router's own Tabs navigator with its own routes, focus state and
 * tabPress events — only the chrome is drawn differently. No second navigator, no second
 * route tree.
 */
export default function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { colors, scheme } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const layout = useAdaptiveLayout();
  const rail = layout.navigation === 'sideRail';
  const routes = state.routes.filter((r) => ICONS[r.name as keyof typeof ICONS]);
  const activeIndex = routes.findIndex((r) => r.key === state.routes[state.index]?.key);
  const indicatorOffset = useSharedValue(0);

  useEffect(() => {
    if (activeIndex >= 0) indicatorOffset.value = withTiming(activeIndex * 100, { duration: reduceMotion ? 0 : 320 });
  }, [activeIndex, reduceMotion]);

  // See isRTLLayout: the rail is one of the few things that cannot rely on flexbox
  // mirroring, because it is positioned against an edge rather than laid out in a row.
  const leadingEdge = isRTLLayout() ? { right: 0 } : { left: 0 };

  const indicatorStyle = useAnimatedStyle(
    () =>
      rail
        ? { transform: [{ translateY: `${indicatorOffset.value}%` }] }
        : { transform: [{ translateX: `${indicatorOffset.value}%` }] },
    [rail],
  );

  // expo-blur only blurs on iOS; on Android it paints a plain translucent View, which let
  // the screen content show through the bar and collide with the tab labels. Android gets
  // an opaque, theme-aware surface instead; iOS keeps the BlurView.
  const opaque = Platform.OS === 'android';

  return (
    <View
      style={[
        styles.wrap,
        opaque && styles.opaque,
        rail
          ? [styles.rail, leadingEdge, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]
          : [styles.bottomBar, { height: 66 + insets.bottom, paddingBottom: insets.bottom }],
      ]}
    >
      {!opaque && <BlurView intensity={40} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />}
      <Animated.View
        style={[
          styles.indicator,
          rail
            // Percentage translate on a fixed-height indicator: '100%' is exactly one
            // item, so the same activeIndex * 100 offset drives both postures.
            ? [styles.indicatorRail, leadingEdge]
            : [styles.indicatorBottom, { width: `${100 / routes.length}%` }],
          indicatorStyle,
        ]}
      />
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
          <Pressable key={route.key} onPress={onPress} style={[styles.tab, rail && styles.tabRail]} hitSlop={4}>
            <Icon size={21} weight="bold" color={isFocused ? colors.tabActive : colors.tabInactive} />
            <Text
              style={[styles.label, { color: isFocused ? colors.tabActive : colors.tabInactive }]}
              numberOfLines={1}
              // Longer translations ("AI Öngörüleri", "تحليلات الذكاء الاصطناعي") at larger font
              // scales were cut to "AI Öngörüle…"; shrink to the tab's width instead.
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: { position: 'absolute' },
  opaque: { backgroundColor: colors.surface },
  bottomBar: {
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rail: {
    top: 0,
    bottom: 0,
    width: NAV_RAIL_WIDTH,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    // Same hairline, rotated with the bar — borderEndWidth so it lands against the
    // content on either writing direction.
    borderEndWidth: StyleSheet.hairlineWidth,
    borderEndColor: colors.border,
  },
  indicator: {
    position: 'absolute',
    backgroundColor: colors.primary,
  },
  indicatorBottom: { top: 0, left: 0, height: 2 },
  indicatorRail: { top: 0, width: 2, height: RAIL_ITEM_HEIGHT },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  // Vertically centred in its own slice of the rail; the bottom bar's 12pt top padding
  // exists only to balance the home indicator underneath it.
  // flexGrow/Shrink/Basis spelled out rather than `flex: 0` — in a column, a 0 flex-basis
  // collapses the item to nothing regardless of its height.
  tabRail: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', height: RAIL_ITEM_HEIGHT, paddingTop: 0, gap: 6 },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
  },
});

