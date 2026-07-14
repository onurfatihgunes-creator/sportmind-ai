import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome, matches } from '@/data/mockData';
import TeamCrest from '@/components/TeamCrest';
import ConfidenceRing from '@/components/ConfidenceRing';
import FactorCompareBar from '@/components/FactorCompareBar';
import Disclaimer from '@/components/Disclaimer';

export default function MatchAnalysisScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = matches.find((m) => m.id === id) ?? matches[0];
  const favourite = favouredOutcome(match);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('matchAnalysis.title')}</Text>
        <Feather name="share" size={16} color={colors.textSecondary} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.teamsRow}>
            <Pressable style={styles.teamCol} onPress={() => router.push(`/team/${match.home.id}`)}>
              <TeamCrest team={match.home} size={38} />
              <Text style={styles.teamName}>{match.home.name}</Text>
            </Pressable>
            <Text style={styles.vs}>{t('common.vs')}</Text>
            <Pressable style={styles.teamCol} onPress={() => router.push(`/team/${match.away.id}`)}>
              <TeamCrest team={match.away} size={38} />
              <Text style={styles.teamName}>{match.away.name}</Text>
            </Pressable>
          </View>
          <Text style={styles.kickoff}>{match.kickoff}</Text>

          <View style={styles.ringWrap}>
            <ConfidenceRing value={favourite.probability} size={92} strokeWidth={8} />
            <Text style={styles.confidenceTeam}>{favourite.team ? favourite.team.name : t('matchAnalysis.draw')}</Text>
            <Text style={styles.confidenceCaption}>
              {favourite.team ? t('matchAnalysis.estimatedWinProbability') : t('matchAnalysis.estimatedDrawProbability')}
            </Text>
          </View>
          <Text style={styles.stabilityCaption}>{t('matchAnalysis.predictionStability')}</Text>
        </View>

        <View style={styles.aiCommentaryCard}>
          <View style={styles.aiCommentaryHeader}>
            <Feather name="zap" size={12} color={colors.primaryLight} />
            <Text style={styles.aiCommentaryLabel}>{t('matchAnalysis.aiCommentary')}</Text>
          </View>
          <Text style={styles.aiCommentaryText}>{t(`aiSummaries.${match.aiSummaryKey}`)}</Text>
        </View>

        <Pressable style={styles.whyCard} onPress={() => router.push(`/explainability/${match.id}`)}>
          <View style={styles.whyHeader}>
            <Text style={styles.whyTitle}>{t('matchAnalysis.whyDoesAiThink')}</Text>
          </View>
          {match.factors.slice(0, 4).map((factor) => (
            <FactorCompareBar key={factor.key} factor={factor} home={match.home} away={match.away} />
          ))}
          <View style={styles.viewAllRow}>
            <Text style={styles.viewAllText}>{t('matchAnalysis.viewAllReasons')}</Text>
            <Feather name="arrow-right" size={12} color={colors.primaryLight} />
          </View>
        </Pressable>

        <Text style={styles.sectionLabel}>{t('matchAnalysis.expectedOutcomeDistribution')}</Text>
        <View style={styles.outcomeBar}>
          <View style={[styles.outcomeSegment, { flex: match.outcomes.home, backgroundColor: colors.success }]}>
            <Text style={styles.outcomeSegmentText}>{match.outcomes.home}</Text>
          </View>
          <View style={[styles.outcomeSegment, { flex: match.outcomes.draw, backgroundColor: colors.warning }]}>
            <Text style={styles.outcomeSegmentText}>{match.outcomes.draw}</Text>
          </View>
          <View style={[styles.outcomeSegment, { flex: match.outcomes.away, backgroundColor: colors.danger }]}>
            <Text style={styles.outcomeSegmentText}>{match.outcomes.away}</Text>
          </View>
        </View>
        <View style={styles.outcomeLegendRow}>
          <Text style={styles.outcomeLegendText}>
            {match.home.name} {t('matchAnalysis.win')}
          </Text>
          <Text style={styles.outcomeLegendText}>{t('matchAnalysis.draw')}</Text>
          <Text style={styles.outcomeLegendText}>
            {match.away.name} {t('matchAnalysis.win')}
          </Text>
        </View>
        <Text style={styles.outcomeCaption}>{t('matchAnalysis.statisticalLikelihood')}</Text>

        <Text style={styles.sectionLabel}>{t('matchAnalysis.expectedGoals')}</Text>
        <View style={styles.xgRow}>
          <Text style={styles.xgValue}>{match.xgHome}</Text>
          <View style={styles.xgTrack}>
            <View
              style={[
                styles.xgFill,
                { width: `${(match.xgHome / (match.xgHome + match.xgAway)) * 100}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
          <View style={styles.xgTrack}>
            <View
              style={[
                styles.xgFill,
                { width: `${(match.xgAway / (match.xgHome + match.xgAway)) * 100}%`, backgroundColor: '#4338CA' },
              ]}
            />
          </View>
          <Text style={styles.xgValue}>{match.xgAway}</Text>
        </View>

        <View style={styles.statPairRow}>
          <View style={styles.statPairCard}>
            <Text style={styles.statPairLabel}>{t('matchAnalysis.combinedExpectedGoals')}</Text>
            <Text style={styles.statPairValue}>{(match.xgHome + match.xgAway).toFixed(1)}</Text>
          </View>
          <View style={styles.statPairCard}>
            <Text style={styles.statPairLabel}>{t('matchAnalysis.recentAverageGoals')}</Text>
            <Text style={styles.statPairValue}>
              {match.recentAvgGoalsHome.toFixed(1)} – {match.recentAvgGoalsAway.toFixed(1)}
            </Text>
          </View>
        </View>

        <Pressable style={styles.linkRow} onPress={() => router.push(`/what-changed/${match.id}`)}>
          <Text style={styles.linkText}>{t('matchAnalysis.whatChangedSinceYesterday')}</Text>
          <Feather name="arrow-right" size={13} color={colors.primaryLight} />
        </Pressable>
        <Pressable
          style={styles.linkRow}
          onPress={() =>
            router.push({
              pathname: '/team-comparison',
              params: { a: match.home.id, b: match.away.id },
            })
          }
        >
          <Text style={styles.linkText}>
            {t('matchAnalysis.compareTeams', { a: match.home.name, b: match.away.name })}
          </Text>
          <Feather name="arrow-right" size={13} color={colors.primaryLight} />
        </Pressable>

        <Disclaimer style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 6 },
  teamCol: { alignItems: 'center' },
  teamName: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary, marginTop: 5 },
  vs: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  kickoff: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginBottom: spacing.md },
  ringWrap: { alignItems: 'center', marginTop: 4 },
  confidenceTeam: { fontFamily: fonts.headline, fontSize: 14, color: colors.textPrimary, marginTop: 8 },
  confidenceCaption: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textMuted, marginTop: 2 },
  stabilityCaption: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted, marginTop: 8 },
  sectionLabel: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.textSecondary, marginBottom: 6 },
  outcomeBar: { flexDirection: 'row', height: 22, borderRadius: 8, overflow: 'hidden', marginBottom: 4 },
  outcomeSegment: { alignItems: 'center', justifyContent: 'center' },
  outcomeSegmentText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: '#0A0A0F' },
  outcomeLegendRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  outcomeLegendText: { fontFamily: fonts.body, fontSize: 9, color: colors.textMuted },
  outcomeCaption: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginBottom: spacing.xl },
  xgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.xl },
  xgValue: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary, width: 26 },
  xgTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  xgFill: { height: '100%', borderRadius: 4 },
  aiCommentaryCard: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: '#312E81',
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  aiCommentaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 },
  aiCommentaryLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLight },
  aiCommentaryText: { fontFamily: fonts.body, fontSize: 12.5, color: '#E5E7EB', lineHeight: 19 },
  whyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  whyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  whyTitle: { fontFamily: fonts.headline, fontSize: 14, color: colors.textPrimary },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 6 },
  viewAllText: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.primaryLight },
  statPairRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.xl },
  statPairCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 12 },
  statPairLabel: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textMuted, marginBottom: 5 },
  statPairValue: { fontFamily: fonts.headline, fontSize: 15, color: colors.textPrimary },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  linkText: { fontFamily: fonts.body, fontSize: 12, color: '#E5E7EB', flex: 1, marginRight: 8 },
});
