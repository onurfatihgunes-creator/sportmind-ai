import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, confidenceColor, fonts, radius } from '@/constants/theme';
import type { Insight } from '@/data/mockData';

export default function InsightCard({ insight, onPress }: { insight: Insight; onPress?: () => void }) {
  const { t } = useTranslation();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <Text style={styles.headline}>{t(`homeInsights.${insight.key}`, insight.params)}</Text>
        {/* Card sits on a tinted purple background, so the chip always uses a plain white
         * fill (rather than the confidence-tiered tint used elsewhere) to stay legible —
         * but the text itself keeps the original confidence-tiered colour. */}
        <View style={styles.chip}>
          <Text style={[styles.chipText, { color: confidenceColor(insight.confidence) }]}>{insight.confidence}%</Text>
        </View>
      </View>
      <Text style={styles.disclaimer}>{t('disclaimer.short')}</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceAccentTo,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    padding: 14,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headline: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.textPrimary, marginRight: 8 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderHover,
  },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  disclaimer: { marginTop: 6, fontFamily: fonts.body, fontSize: 10, color: colors.textFainter },
});
