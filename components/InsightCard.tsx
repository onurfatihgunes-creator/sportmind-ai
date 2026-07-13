import { StyleSheet, Text, View } from 'react-native';
import { colors, confidenceColor, fonts } from '@/constants/theme';
import type { Insight } from '@/data/mockData';

export default function InsightCard({ insight }: { insight: Insight }) {
  const color = confidenceColor(insight.confidence);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.headline}>{insight.headline}</Text>
        <View style={[styles.chip, { backgroundColor: `${color}22` }]}>
          <Text style={[styles.chipText, { color }]}>{insight.confidence}%</Text>
        </View>
      </View>
      <Text style={styles.disclaimer}>AI-generated analysis. Outcomes remain unpredictable.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headline: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textPrimary, marginRight: 8 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  disclaimer: { marginTop: 7, fontFamily: fonts.body, fontSize: 9, color: colors.textFaint },
});
