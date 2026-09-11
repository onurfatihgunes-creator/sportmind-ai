import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Icon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';

/** The shared honest "not found" state for a route whose id param didn't resolve to a
 * real entity — after checking Supabase directly (see data/liveData.ts's
 * resolveMatchById/resolveTeamById), not just "missing from the currently-loaded window."
 * Used by match/[id], team/[id], team-insights/[teamId], and team-comparison instead of
 * ever falling back to a different match/team. Mirrors the visual shape of the app's
 * other empty states (e.g. my-matches.tsx's "no saved matches" card) — same tokens, no
 * new visual language. */
export default function NotFoundState({
  icon: EntityIcon,
  title,
  body,
  ctaLabel,
  onPressCta,
}: {
  icon: Icon;
  title: string;
  body: string;
  /** Optional together: the wide-window "nothing selected yet" panes reuse this exact
   *  shape but have nothing to offer a button for — the list beside them is the action. */
  ctaLabel?: string;
  onPressCta?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <EntityIcon size={28} color={colors.textFainter} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {ctaLabel && onPressCta && (
        <Pressable style={styles.cta} onPress={onPressCta}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.lg, gap: 8 },
  title: { fontFamily: fonts.headline, fontSize: 16, color: colors.textPrimary, marginTop: 8, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', maxWidth: 260 },
  cta: { marginTop: spacing.md, backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.borderHover, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 },
  ctaText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.primaryLink },
});
