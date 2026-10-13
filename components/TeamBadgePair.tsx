import { StyleSheet, View } from 'react-native';
import TeamAvatar from '@/components/TeamAvatar';
import type { Team } from '@/data/mockData';
import { useAppTheme } from '@/contexts/ThemeContext';

type Props = { home: Team; away: Team; size?: number };

/** The overlapping two-avatar cluster used throughout the redesign (match rows, hero cards,
 * headers). Each avatar is a TeamAvatar: the real crest when the team has one, else a coloured
 * code badge. The overlap is a share of the size (not a fixed 8dp) so the covered avatar's
 * letters stay clear of the one on top at every size: three capitals at the shared avatar text
 * size reach about 0.9 of the circle's width, so the overlap has to stay under the remaining 0.1
 * or the last letter ("ATL", "STO", "WOL") is cut by the second avatar. */
export default function TeamBadgePair({ home, away, size = 26 }: Props) {
  const { colors } = useAppTheme();
  // The ring starts just inside the first circle's edge. Three capitals at the shared text size
  // reach ~0.93 of the circle's width, so the ring must not start before ~0.95 or it cuts the
  // last letter ("RBL", "ATL").
  const overlap = Math.round(size * 0.04);
  return (
    <View style={styles.row}>
      <TeamAvatar team={home} size={size} />
      {/* The separating ring is drawn OUTSIDE the second circle (a ring-coloured wrapper with
          padding), not as a border inside it: a border inside ate RING px from each side and made
          this circle visibly smaller than the first. Both circles are exactly `size` now. The
          negative vertical margin keeps the pair's overall height at `size`. */}
      <View
        style={{
          marginLeft: -overlap,
          marginVertical: -RING,
          padding: RING,
          borderRadius: (size + RING * 2) / 2,
          backgroundColor: colors.surface,
        }}
      >
        <TeamAvatar team={away} size={size} />
      </View>
    </View>
  );
}

/** Width of the ring that separates the two overlapping avatars. */
const RING = 2;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
