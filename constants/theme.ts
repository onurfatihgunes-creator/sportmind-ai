export const colors = {
  background: '#0A0A0F',
  surface: '#15151C',
  surfaceElevated: '#1E1E28',
  surfaceAlt: '#111116',
  border: '#1F2937',

  primary: '#4F46E5',
  primaryLight: '#818CF8',
  primaryMuted: 'rgba(79, 70, 229, 0.14)',

  success: '#22C55E',
  successText: '#4ADE80',
  successMuted: 'rgba(34, 197, 94, 0.14)',

  warning: '#F59E0B',
  warningText: '#FBBF24',
  warningMuted: 'rgba(245, 158, 11, 0.14)',

  danger: '#EF4444',
  dangerText: '#F87171',
  dangerMuted: 'rgba(239, 68, 68, 0.14)',

  textPrimary: '#F5F5F7',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  textFaint: '#4B5563',
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
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
} as const;

export const fonts = {
  headline: 'Sora_600SemiBold',
  headlineBold: 'Sora_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
} as const;

/** Everything is free for now — flip this back on (and remove `href: null` from the
 * premium tab in app/(tabs)/_layout.tsx) to bring back the paywall/pricing surfaces. */
export const PREMIUM_ENABLED = false;

export const disclaimer =
  'AI-generated analysis based on statistical data. Outcomes remain unpredictable.';

export function confidenceColor(value: number) {
  if (value >= 70) return colors.success;
  if (value >= 45) return colors.warning;
  return colors.danger;
}
