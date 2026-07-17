import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import TeamCrest from '@/components/TeamCrest';
import ConfidenceRing from '@/components/ConfidenceRing';
import Disclaimer from '@/components/Disclaimer';

export default function BatchAnalysisScreen() {
  const { t } = useTranslation();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const { matches } = useAppData();
  const selectedIds = (ids ?? '').split(',').filter(Boolean);
  const selectedMatches = matches.filter((m) => selectedIds.includes(m.id));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('batchAnalysis.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.note}>{t('batchAnalysis.note')}</Text>

        {selectedMatches.map((m) => {
          const favourite = favouredOutcome(m);
          return (
          <Pressable key={m.id} style={styles.card} onPress={() => router.push(`/match/${m.id}`)}>
            <View style={styles.cardTop}>
              <View style={styles.crests}>
                <TeamCrest team={m.home} size={28} />
                <TeamCrest team={m.away} size={28} overlap />
              </View>
              <ConfidenceRing value={favourite.probability} size={34} strokeWidth={3} />
            </View>
            <Text style={styles.matchTitle}>
              {m.home.name} {t('common.vs')} {m.away.name}
            </Text>
            <Text style={styles.matchSubtitle}>
              {m.kickoff} · {m.competition} ·{' '}
              {favourite.team ? t('matchCard.favoured', { team: favourite.team.name }) : t('matchCard.drawLikely')}
            </Text>
            <View style={styles.viewLink}>
              <Text style={styles.viewLinkText}>{t('common.viewFullAnalysis')}</Text>
              <Feather name="arrow-right" size={12} color={colors.primaryLight} />
            </View>
          </Pressable>
          );
        })}

        <Disclaimer style={{ marginTop: spacing.md }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.headline, fontSize: 14, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  note: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  crests: { flexDirection: 'row', alignItems: 'center' },
  matchTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },
  matchSubtitle: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted, marginTop: 3, marginBottom: spacing.sm },
  viewLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  viewLinkText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLight },
});
