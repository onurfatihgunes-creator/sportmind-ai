import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome, matches } from '@/data/mockData';
import TeamCrest from '@/components/TeamCrest';
import ConfidenceRing from '@/components/ConfidenceRing';
import Disclaimer from '@/components/Disclaimer';

export default function MatchAnalysisScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = matches.find((m) => m.id === id) ?? matches[0];
  const favourite = favouredOutcome(match);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>Match analysis</Text>
        <Feather name="share" size={16} color={colors.textSecondary} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.teamsRow}>
            <Pressable style={styles.teamCol} onPress={() => router.push(`/team/${match.home.id}`)}>
              <TeamCrest team={match.home} size={38} />
              <Text style={styles.teamName}>{match.home.name}</Text>
            </Pressable>
            <Text style={styles.vs}>vs</Text>
            <Pressable style={styles.teamCol} onPress={() => router.push(`/team/${match.away.id}`)}>
              <TeamCrest team={match.away} size={38} />
              <Text style={styles.teamName}>{match.away.name}</Text>
            </Pressable>
          </View>
          <Text style={styles.kickoff}>{match.kickoff}</Text>

          <View style={styles.ringWrap}>
            <ConfidenceRing value={favourite.probability} size={92} strokeWidth={8} />
            <Text style={styles.confidenceCaption}>
              {favourite.team ? `${favourite.team.name} win likelihood` : 'Draw likelihood'}
            </Text>
          </View>
          <Text style={styles.stabilityCaption}>Prediction stability — stable over 72h</Text>
        </View>

        <Text style={styles.sectionLabel}>Expected outcome distribution</Text>
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
          <Text style={styles.outcomeLegendText}>{match.home.name} win</Text>
          <Text style={styles.outcomeLegendText}>Draw</Text>
          <Text style={styles.outcomeLegendText}>{match.away.name} win</Text>
        </View>
        <Text style={styles.outcomeCaption}>Statistical likelihood, not a prediction</Text>

        <Text style={styles.sectionLabel}>Expected goals</Text>
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

        <Pressable style={styles.whyCard} onPress={() => router.push(`/explainability/${match.id}`)}>
          <View style={styles.whyHeader}>
            <Text style={styles.whyTitle}>Why does the AI think this?</Text>
            <Feather name="chevron-right" size={14} color={colors.textMuted} />
          </View>
          <MiniSignal label="Recent form" value={31 * 3} />
          <MiniSignal label="Expected goals" value={22 * 3} />
        </Pressable>

        <Pressable style={styles.linkRow} onPress={() => router.push(`/what-changed/${match.id}`)}>
          <Text style={styles.linkText}>What changed since yesterday?</Text>
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
          <Text style={styles.linkText}>Compare {match.home.name} and {match.away.name}</Text>
          <Feather name="arrow-right" size={13} color={colors.primaryLight} />
        </Pressable>

        <Disclaimer style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MiniSignal({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.miniSignalRow}>
      <Text style={styles.miniSignalLabel}>{label}</Text>
      <View style={styles.miniSignalTrack}>
        <View style={[styles.miniSignalFill, { width: `${Math.min(100, value)}%` }]} />
      </View>
    </View>
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
  confidenceCaption: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textMuted, marginTop: 8 },
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
  whyCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  whyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  whyTitle: { fontFamily: fonts.headline, fontSize: 14, color: colors.textPrimary },
  miniSignalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  miniSignalLabel: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary, width: 82 },
  miniSignalTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  miniSignalFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  linkText: { fontFamily: fonts.body, fontSize: 12, color: '#E5E7EB', flex: 1, marginRight: 8 },
});
