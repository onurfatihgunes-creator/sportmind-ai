import { StyleSheet, View } from 'react-native';
import TeamAvatar from '@/components/TeamAvatar';
import type { Team } from '@/data/mockData';
import { useAppTheme } from '@/contexts/ThemeContext';

type Props = { home: Team; away: Team; size?: number };

/** The overlapping two-avatar cluster used throughout the redesign (match rows, hero cards,
 * headers). Each avatar is a TeamAvatar: the real crest when the team has one, else a coloured
 * code badge. The overlap is a share of the size (not a fixed 8dp) so the covered avatar's
 * letters stay clear of the one on top at every size. */
export default function TeamBadgePair({ home, away, size = 26 }: Props) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      <TeamAvatar team={home} size={size} />
      <TeamAvatar
        team={away}
        size={size}
        style={{ marginLeft: -Math.round(size * 0.18), borderWidth: 2, borderColor: colors.surface }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});
