import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon, ArrowsClockwiseIcon, ChartLineUpIcon, DatabaseIcon, PercentIcon, XCircleIcon } from 'phosphor-react-native';
import type { Icon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useAppData } from '@/contexts/DataContext';

type MethodologySection = { Icon: Icon; key: string; iconColor?: string };

const sections: MethodologySection[] = [
  { Icon: DatabaseIcon, key: 'dataSources' },
  { Icon: PercentIcon, key: 'confidence' },
  { Icon: ArrowsClockwiseIcon, key: 'whyChange' },
  { Icon: XCircleIcon, key: 'cannotDo', iconColor: colors.dangerText },
];

export default function MethodologyScreen() {
  const { t } = useTranslation();
  const { trackRecord } = useAppData();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('methodology.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sections.map((s) => (
          <View key={s.key} style={styles.card}>
            <View style={styles.cardHeader}>
              <s.Icon size={14} weight="bold" color={s.iconColor ?? colors.primary} />
              <Text style={styles.cardTitle}>{t(`methodology.${s.key}Title`)}</Text>
            </View>
            <Text style={styles.cardBody}>{t(`methodology.${s.key}Body`)}</Text>
          </View>
        ))}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <ChartLineUpIcon size={14} weight="bold" color={colors.primary} />
            <Text style={styles.cardTitle}>{t('methodology.modelPerformanceTitle')}</Text>
          </View>
          <Text style={styles.cardBody}>
            {trackRecord.length > 0 ? t('methodology.modelPerformanceBody') : t('methodology.modelPerformanceEmpty')}
          </Text>
          {trackRecord.length > 0 && (
            <View style={{ gap: 8, marginTop: 10 }}>
              {trackRecord.map((entry) => (
                <View key={entry.id} style={styles.trackRecordRow}>
                  <Text style={styles.trackRecordScoreLine} numberOfLines={1}>
                    {entry.home} {entry.homeScore}-{entry.awayScore} {entry.away}
                  </Text>
                  <Text style={styles.trackRecordCaption}>
                    {entry.predictedTeam
                      ? t('methodology.trackRecordCalledTeam', { team: entry.predictedTeam, pct: entry.predictedPct })
                      : t('methodology.trackRecordCalledDraw', { pct: entry.predictedPct })}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.version}>{t('methodology.version')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.screenX, paddingTop: 10, paddingBottom: 60 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  cardBody: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiaryAlt, lineHeight: 18 },
  trackRecordRow: { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  trackRecordScoreLine: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary, marginBottom: 3 },
  trackRecordCaption: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  version: { fontFamily: fonts.body, fontSize: 11, color: colors.textFainter, textAlign: 'center', marginTop: spacing.md },
});
