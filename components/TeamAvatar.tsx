import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { fonts } from '@/constants/theme';
import type { Team } from '@/data/mockData';

type AvatarTeam = Pick<Team, 'code' | 'bg' | 'fg'>;

type Props = {
  team: AvatarTeam;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** One text size for every avatar, applied to 1, 2 and 3 letter codes alike so initials never look
 *  bigger on one badge than the next; nothing is fitted or recalculated per code. It is as large
 *  as it can be while the widest realistic code still has air around it: at 0.40 "MUN" ran from
 *  one edge of the circle to the other (measured at 34dp), at 0.36 it keeps ~2dp on each side. */
export const AVATAR_FONT_SHARE = 0.36;

export function avatarFontSize(size: number): number {
  return Math.round(size * AVATAR_FONT_SHARE * 10) / 10;
}

/**
 * The one team avatar every screen uses: a 2-3 letter code centred in the team's colour. Real
 * crests are deliberately not shown — that would mean requests to a third-party image host from
 * every device (and a trademark question), so this stays a local, text-only badge.
 *
 * The circle is a fixed size, so the text inside it deliberately ignores the system font scale
 * (allowFontScaling off) — scaling it is what pushed three-letter codes out of the circle and
 * wrapped them onto two lines — and it has one fixed size for every code length. The team name
 * next to it is ordinary text and still scales.
 */
export default function TeamAvatar({ team, size = 30, style }: Props) {
  const code = (team.code ?? '').trim().toUpperCase().slice(0, 3);

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: team.bg }, style]}>
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        ellipsizeMode="clip"
        style={[styles.code, { fontSize: avatarFontSize(size), color: team.fg }]}
      >
        {code}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  code: { fontFamily: fonts.bodyBold, textAlign: 'center', includeFontPadding: false },
});
