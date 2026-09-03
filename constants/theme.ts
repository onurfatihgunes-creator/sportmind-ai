export const colors = {
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

  highlightBg: '#5d5294',
  highlightBgAlt: '#796cbf',
  highlightText: '#fdfdff',
  highlightTextMuted: '#cec8e6',
  highlightAccent: '#d3c9f2',

  tabBarBackground: 'rgba(250,251,254,.9)',
  tabActive: '#4b4180',
  tabInactive: '#9498a9',
} as const;

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

/** Everything is free for now — flip this back on (and remove `href: null` from the
 * premium tab in app/(tabs)/_layout.tsx) to bring back the paywall/pricing surfaces. */
export const PREMIUM_ENABLED = false;

export const disclaimer =
  'Yapay zekâ üretimi istatistiksel analiz. Sonuçlar öngörülemez.';

/** Two-tier confidence emphasis used for badges/chips — the light redesign dropped the
 * old three-tier red/amber/green semantic in favor of a single accent hue with only an
 * intensity toggle (accent-tinted above the threshold, neutral below it). */
export function confidenceColor(value: number) {
  return value >= 55 ? colors.primaryText : colors.textSecondaryAlt;
}

export function confidenceBadgeBg(value: number) {
  return value >= 55 ? colors.primaryTintStrong : colors.divider;
}

export type ChangeTone = 'success' | 'warning' | 'danger';

export function toneColor(tone: ChangeTone) {
  return { success: colors.success, warning: colors.warning, danger: colors.danger }[tone];
}

export function toneTextColor(tone: ChangeTone) {
  return { success: colors.successText, warning: colors.warningText, danger: colors.dangerText }[tone];
}

export function toneMutedColor(tone: ChangeTone) {
  return { success: colors.successMuted, warning: colors.warningMuted, danger: colors.dangerMuted }[tone];
}
