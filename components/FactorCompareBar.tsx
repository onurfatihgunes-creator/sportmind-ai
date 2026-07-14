import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/constants/theme';
import type { MatchFactor, Team } from '@/data/mockData';

export default function FactorCompareBar({
  factor,
  home,
  away,
}: {
  factor: MatchFactor;
  home: Team;
  away: Team;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{factor.label}</Text>
      <View style={styles.track}>
        <View style={[styles.segment, { flex: factor.home, backgroundColor: colors.primary }]} />
        <View style={[styles.segment, { flex: factor.away, backgroundColor: '#4338CA', opacity: 0.55 }]} />
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendText}>
          {home.name} <Text style={styles.legendValue}>{factor.home}%</Text>
        </Text>
        <Text style={[styles.legendText, styles.legendTextRight]}>
          <Text style={styles.legendValue}>{factor.away}%</Text> {away.name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 14 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textPrimary, marginBottom: 6 },
  track: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 5 },
  segment: { height: '100%' },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between' },
  legendText: { fontFamily: fonts.body, fontSize: 10, color: colors.textSecondary },
  legendTextRight: { textAlign: 'right' },
  legendValue: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
});
