import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { fonts } from '@/constants/theme';
import type { Team } from '@/data/mockData';

type AvatarTeam = Pick<Team, 'code' | 'bg' | 'fg'>;

type Props = {
  team: AvatarTeam;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Initials font size as a share of the circle, tuned to how many characters have to fit:
 *  three bold capitals need a smaller em than one. Pure so the sizing is directly testable. */
export function avatarFontSize(code: string, size: number): number {
  const length = code.length;
  const share = length <= 1 ? 0.46 : length === 2 ? 0.4 : 0.32;
  return Math.round(size * share * 10) / 10;
}

/**
 * The one team avatar every screen uses: a 2-3 letter code centred in the team's colour. Real
 * crests are deliberately not shown — that would mean requests to a third-party image host from
 * every device (and a trademark question), so this stays a local, text-only badge.
 *
 * The circle is a fixed size, so the text inside it deliberately ignores the system font scale
 * (allowFontScaling off) — scaling it is what pushed three-letter codes out of the circle and
 * wrapped them onto two lines. The team name next to it is ordinary text and still scales.
 */
export default function TeamAvatar({ team, size = 30, style }: Props) {
  const code = (team.code ?? '').trim().toUpperCase().slice(0, 3);

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: team.bg }, style]}>
      <Text
        numberOfLines={1}
        allowFontScaling={false}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[styles.code, { fontSize: avatarFontSize(code, size), color: team.fg, maxWidth: size - 4 }]}
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
