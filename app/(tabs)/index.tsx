import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import { useWatchlist } from '@/contexts/WatchlistContext';
import MatchCard from '@/components/MatchCard';
import InsightCard from '@/components/InsightCard';
import TeamCrest from '@/components/TeamCrest';
import ConfidenceRing from '@/components/ConfidenceRing';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { matches, insights, isLive, loading } = useAppData();
  const { matchIds, isWatched, toggle } = useWatchlist();
  // "Key" matches = the ones the model is most decisive about (highest predicted
  // probability), not an editorial pick — we have no real popularity signal to rank on.
  const topMatches = [...matches].sort((a, b) => favouredOutcome(b).probability - favouredOutcome(a).probability).slice(0, 5);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingSmall}>{t('home.goodEvening')}</Text>
            <Text style={styles.greetingName}>Onur</Text>
          </View>
          <LinearGradient colors={[colors.primary, '#7C3AED']} style={styles.avatar}>
            <Feather name="zap" size={16} color="#fff" />
          </LinearGradient>
        </View>

        {!loading && (
          <View style={[styles.dataBadge, isLive ? styles.dataBadgeLive : styles.dataBadgeDemo]}>
            <View style={[styles.dataBadgeDot, { backgroundColor: isLive ? colors.success : colors.warning }]} />
            <Text style={styles.dataBadgeText}>{isLive ? t('home.liveData') : t('home.demoData')}</Text>
          </View>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{t('home.todaysKeyMatches')}</Text>
          <Pressable style={styles.viewAllLink} onPress={() => router.push('/(tabs)/explore')}>
            <Text style={styles.viewAllLinkText}>{t('common.viewAll')}</Text>
            <Feather name="arrow-right" size={11} color={colors.primaryLight} />
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.matchRow}
          contentContainerStyle={{ paddingRight: spacing.xxl }}
        >
          {topMatches.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </ScrollView>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{t('home.allMatches')}</Text>
          <Pressable style={styles.myMatchesLink} onPress={() => router.push('/my-matches')}>
            <Feather name="bookmark" size={12} color={colors.primaryLight} />
            <Text style={styles.myMatchesLinkText}>{t('home.myMatches', { count: matchIds.length })}</Text>
          </Pressable>
        </View>
        <View style={styles.allMatchesList}>
        {matches.map((m) => {
          const favourite = favouredOutcome(m);
          const watched = isWatched(m.id);
          return (
            <Pressable key={m.id} style={styles.allMatchRow} onPress={() => router.push(`/match/${m.id}`)}>
              <View style={styles.allMatchCrests}>
                <TeamCrest team={m.home} size={28} />
                <TeamCrest team={m.away} size={28} overlap />
              </View>
              <View style={styles.allMatchInfo}>
                <Text style={styles.allMatchTitle}>
                  {m.home.name} {t('common.vs')} {m.away.name}
                </Text>
                <Text style={styles.allMatchSubtitle}>
                  {m.kickoff} · {m.competition}
                </Text>
              </View>
              <Pressable hitSlop={10} onPress={() => toggle(m.id)}>
                <Feather name="bookmark" size={16} color={watched ? colors.primaryLight : colors.textFaint} />
              </Pressable>
              <ConfidenceRing value={favourite.probability} size={30} strokeWidth={3.5} />
            </Pressable>
          );
        })}
        </View>

        <LinearGradient
          colors={['#1E1B4B', colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.3 }}
          style={styles.highlightCard}
        >
          <View style={styles.highlightLabelRow}>
            <Feather name="zap" size={12} color={colors.primaryLight} />
            <Text style={styles.highlightLabel}>{t('home.aiMatchHighlight')}</Text>
          </View>
          <Text style={styles.highlightTitle}>{t('home.threeThingsChanged')}</Text>
          <Text style={styles.highlightSubtitle}>{t('home.lineupsWeatherForm')}</Text>
        </LinearGradient>

        <Text style={styles.sectionLabel}>{t('home.latestAiInsights')}</Text>
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}

        <Pressable style={styles.premiumBanner} onPress={() => router.push('/(tabs)/premium')}>
          <View>
            <Text style={styles.premiumTitle}>{t('home.unlockUnlimited')}</Text>
            <Text style={styles.premiumSubtitle}>{t('home.goPremium')}</Text>
          </View>
          <Feather name="lock" size={18} color={colors.primaryLight} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.md, marginBottom: spacing.xl },
  greetingSmall: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  greetingName: { fontFamily: fonts.headline, fontSize: 20, color: colors.textPrimary, marginTop: 1 },
  avatar: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dataBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
    borderWidth: 1,
  },
  dataBadgeLive: { backgroundColor: `${colors.success}18`, borderColor: `${colors.success}40` },
  dataBadgeDemo: { backgroundColor: `${colors.warning}18`, borderColor: `${colors.warning}40` },
  dataBadgeDot: { width: 6, height: 6, borderRadius: 3 },
  dataBadgeText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textSecondary },
  sectionLabel: {
    fontFamily: fonts.headline,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  myMatchesLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.md },
  myMatchesLinkText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLight },
  viewAllLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.md },
  viewAllLinkText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLight },
  matchRow: { marginBottom: spacing.xl },
  allMatchesList: { marginBottom: spacing.xl },
  allMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    marginBottom: spacing.sm,
  },
  allMatchCrests: { flexDirection: 'row', alignItems: 'center' },
  allMatchInfo: { flex: 1 },
  allMatchTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textPrimary },
  allMatchSubtitle: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textMuted, marginTop: 2 },
  highlightCard: { borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: '#2E2A5C' },
  highlightLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  highlightLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLight },
  highlightTitle: { fontFamily: fonts.headline, fontSize: 15, color: colors.textPrimary },
  highlightSubtitle: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 4 },
  premiumBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#312E81',
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  premiumTitle: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: '#C7D2FE' },
  premiumSubtitle: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary, marginTop: 2 },
});
