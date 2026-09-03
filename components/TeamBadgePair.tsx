import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/constants/theme';
import type { Team } from '@/data/mockData';

type Props = { home: Team; away: Team; size?: number };

/** The overlapping two-crest cluster used throughout the redesign (match rows, hero cards,
 * headers). Real logos are intentionally not used — see design handoff README's Assets
 * section — a colored initials badge stands in, sized/overlapped per spec (-size*0.3). */
export default function TeamBadgePair({ home, away, size = 26 }: Props) {
  const fontSize = Math.round(size * 0.36);
  return (
    <View style={styles.row}>
      <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: home.bg }]}>
        <Text style={[styles.code, { fontSize, color: home.fg }]}>{home.code}</Text>
      </View>
      <View
        style={[
          styles.badge,
          styles.overlap,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: away.bg, borderColor: colors.surface },
        ]}
      >
        <Text style={[styles.code, { fontSize, color: away.fg }]}>{away.code}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  overlap: { marginLeft: -8, borderWidth: 2 },
  code: { fontFamily: fonts.bodyBold },
});
