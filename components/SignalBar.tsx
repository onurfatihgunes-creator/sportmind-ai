import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/constants/theme';

export default function SignalBar({
  label,
  value,
  maxValue = 31,
}: {
  label: string;
  value: number;
  maxValue?: number;
}) {
  const width = Math.min(100, (value / maxValue) * 100);

  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${width}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 12 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontFamily: fonts.body, fontSize: 13, color: '#E5E7EB' },
  value: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primaryLight },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
});
