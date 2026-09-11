import type { ColorScheme } from './appearance';

/**
 * The light palette, unchanged — every value here is exactly what the app shipped with
 * before it gained a dark mode, so a light build is pixel-identical to the old one.
 */
export const lightColors = {
  background: '#f4f5fb',
  backgroundGradientTop: '#f7f7fd',
  backgroundGradientBottom: '#eeecfa',
  surface: '#fdfdff',
  surfaceAccentFrom: '#fbfaff',
  surfaceAccentVia: '#f2f0fd',
  surfaceAccentTo: '#eeebfb',
  surfaceSubtle: '#f6f6fc',
  surfaceSelected: '#fbfaff',

  border: '#e6e8f4',
  borderAccent: '#dcdaf0',
  borderHover: '#cfcbe9',
  divider: '#eceef8',
  segmentTrack: '#e6e8f4',
  toggleOff: '#d3d7e8',

  textPrimary: '#292b31',
  textSecondary: '#3d4152',
  textSecondaryAlt: '#5c6076',
  textTertiary: '#6c7085',
  textTertiaryAlt: '#7b7f93',
  textFaint: '#8a8ea1',
  textFainter: '#a3a7b8',
  textFaintest: '#c3c7d8',

  primary: '#796cbf',
  primaryLight: '#796cbf',
  primaryText: '#4b4180',
  primaryLink: '#5d5294',
  primaryLinkHover: '#423a6a',
  primaryTint: '#f5f4ff',
  primaryTintStrong: '#e7e5fe',
  primarySecondaryTone: '#9690c9',
  primaryMuted: 'rgba(121, 108, 191, 0.16)',

  neutralSeries: '#5b6180',
  neutralSeriesLight: '#c3c7d8',

  success: '#2f7d63',
  successText: '#2f6340',
  successMuted: '#e4efe9',

  warning: '#b08a2b',
  warningText: '#8a7020',
  warningMuted: '#f5eddb',

  danger: '#a8503f',
  dangerText: '#8a4234',
  dangerMuted: '#f4e6e3',
  dangerBorder: '#e8d6d2',

  info: '#3d6fa8',
  infoText: '#3d5a80',
  infoMuted: '#e3e9f5',

  highlightBg: '#5d5294',
  highlightBgAlt: '#796cbf',
  highlightText: '#fdfdff',
  highlightTextMuted: '#cec8e6',
  highlightAccent: '#d3c9f2',

  tabBarBackground: 'rgba(250,251,254,.9)',
  tabActive: '#4b4180',
  tabInactive: '#9498a9',
} as const;

export type ThemeColors = { readonly [K in keyof typeof lightColors]: string };

/**
 * The dark palette. Same keys, same ROLES — not a new visual language.
 *
 * Every value was chosen from how the token is actually used rather than by inverting a
 * hex, because several of these tokens are one half of a fixed foreground/background
 * pair and only the pair has to keep working:
 *
 * - `segmentTrack` is the recessed track a `surface`-coloured pill slides along, so on
 *   dark it goes BELOW surface (to the page colour) rather than above it — otherwise the
 *   selected segment reads as a hole instead of a raised chip.
 * - `neutralSeries` carries `surface` as its label and `neutralSeriesLight` carries
 *   `textSecondary` (see StackedDistributionBar). Since both of those text tokens flip
 *   with the theme, the two bar colours flip with them — which means on dark
 *   `neutralSeriesLight` is genuinely darker than `neutralSeries`. The names read
 *   backwards there; the contrast does not. Do not "fix" this by swapping them.
 * - the `*Muted` tokens are badge backgrounds that always carry their matching `*Text`
 *   token, so they go dark while the text goes light.
 * - `highlightText` is the foreground printed on a `primary` fill. Primary is light on
 *   dark, so its foreground goes dark.
 */
export const darkColors: ThemeColors = {
  background: '#14141b',
  backgroundGradientTop: '#17171f',
  backgroundGradientBottom: '#111018',
  surface: '#1e1e28',
  surfaceAccentFrom: '#20202b',
  surfaceAccentVia: '#232232',
  surfaceAccentTo: '#262536',
  surfaceSubtle: '#1a1a23',
  surfaceSelected: '#242433',

  border: '#2c2c3a',
  borderAccent: '#38374a',
  borderHover: '#454358',
  divider: '#262633',
  // Below `surface`, not above it — see the note on the pill above.
  segmentTrack: '#14141b',
  toggleOff: '#3a3a4a',

  textPrimary: '#eceaf4',
  textSecondary: '#d7d5e2',
  textSecondaryAlt: '#b8b6c8',
  textTertiary: '#a3a1b4',
  textTertiaryAlt: '#9492a6',
  textFaint: '#85839a',
  textFainter: '#6f6d84',
  textFaintest: '#514f63',

  primary: '#9d92dd',
  primaryLight: '#9d92dd',
  primaryText: '#c3bbf0',
  primaryLink: '#b2a8e8',
  primaryLinkHover: '#cec8f5',
  primaryTint: '#1f1d2e',
  primaryTintStrong: '#2b2742',
  primarySecondaryTone: '#8079ad',
  primaryMuted: 'rgba(157, 146, 221, 0.20)',

  neutralSeries: '#8a90b0',
  neutralSeriesLight: '#3f4257',

  success: '#4bbd94',
  successText: '#79d3ae',
  successMuted: '#16302a',

  warning: '#d9ac4d',
  warningText: '#e6c477',
  warningMuted: '#332a16',

  danger: '#d97c68',
  dangerText: '#eda28f',
  dangerMuted: '#35211d',
  dangerBorder: '#4a2d27',

  info: '#6f9fd8',
  infoText: '#96bce8',
  infoMuted: '#1a2536',

  highlightBg: '#6b5fa8',
  highlightBgAlt: '#9d92dd',
  highlightText: '#191826',
  highlightTextMuted: '#3d3757',
  highlightAccent: '#4a4270',

  tabBarBackground: 'rgba(20,20,27,.9)',
  tabActive: '#c3bbf0',
  tabInactive: '#7b7990',
};

export const palettes: Record<ColorScheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

/**
 * TRANSITIONAL — the light palette under its old module-level name.
 *
 * Most screens still do `import { colors } from '@/constants/theme'` and read it at
 * module scope, inside a StyleSheet.create that runs once. Those screens are therefore
 * LIGHT-ONLY and will not follow the appearance setting until they are migrated to read
 * the palette from useAppTheme() at render time. This alias exists so the app keeps
 * compiling and behaving exactly as it did while that migration happens screen by
 * screen — it is not a themed value, and nothing new should be written against it.
 */
export const colors = lightColors;

export const radius = {
  sm: 9,
  md: 14,
  lg: 16,
  xl: 18,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  screenX: 22,
} as const;

export const fonts = {
  headline: 'Inter_500Medium',
  headlineBold: 'Inter_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const disclaimer =
  'Yapay zekâ üretimi istatistiksel analiz. Sonuçlar öngörülemez.';

/** Two-tier confidence emphasis used for badges/chips — the light redesign dropped the
 * old three-tier red/amber/green semantic in favor of a single accent hue with only an
 * intensity toggle (accent-tinted above the threshold, neutral below it).
 *
 * The palette is an optional LAST argument, defaulting to light: a migrated screen passes
 * its own active palette, and the screens still on the transitional `colors` alias above
 * keep calling these with one argument, unchanged. */
export function confidenceColor(value: number, colors: ThemeColors = lightColors) {
  return value >= 55 ? colors.primaryText : colors.textSecondaryAlt;
}

export function confidenceBadgeBg(value: number, colors: ThemeColors = lightColors) {
  return value >= 55 ? colors.primaryTintStrong : colors.divider;
}

export type ChangeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function toneColor(tone: ChangeTone, colors: ThemeColors = lightColors) {
  return { success: colors.success, warning: colors.warning, danger: colors.danger, info: colors.info, neutral: colors.textSecondaryAlt }[tone];
}

export function toneTextColor(tone: ChangeTone, colors: ThemeColors = lightColors) {
  return { success: colors.successText, warning: colors.warningText, danger: colors.dangerText, info: colors.infoText, neutral: colors.textSecondaryAlt }[tone];
}

export function toneMutedColor(tone: ChangeTone, colors: ThemeColors = lightColors) {
  return { success: colors.successMuted, warning: colors.warningMuted, danger: colors.dangerMuted, info: colors.infoMuted, neutral: colors.divider }[tone];
}
