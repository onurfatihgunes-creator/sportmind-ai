import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  BasketballIcon,
  LightningIcon,
  SoccerBallIcon,
  SparkleIcon,
} from 'phosphor-react-native';
import { colors, confidenceColor, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome, type Sport } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import { useFollowedTeams } from '@/contexts/FollowedTeamsContext';
import { useProfile } from '@/contexts/ProfileContext';
import ConfidenceRing from '@/components/ConfidenceRing';
import SegmentedControl from '@/components/SegmentedControl';
import TeamBadgePair from '@/components/TeamBadgePair';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { matches, changeEvents, isLive, loading } = useAppData();
  const { teamIds: followedTeamIds } = useFollowedTeams();
  const { name } = useProfile();
  const [selectedSport, setSelectedSport] = useState<Sport>('football');

  const { width: windowWidth } = useWindowDimensions();
  const heroCardWidth = Math.min(360, windowWidth - spacing.screenX - 56);

  const sportMatches = useMemo(() => matches.filter((m) => m.sport === selectedSport), [matches, selectedSport]);
  const heroMatches = useMemo(
    () => [...sportMatches].sort((a, b) => favouredOutcome(b).probability - favouredOutcome(a).probability).slice(0, 6),
    [sportMatches],
  );

  // Personalised, not a duplicate of Today's highlights above — this surfaces
  // each followed team's own next match regardless of sport/competition, so a
  // team with no upcoming match in the loaded window simply produces no row
  // rather than an awkward placeholder.
  const followingRows = useMemo(() => {
    return followedTeamIds
      .map((teamId) => matches.find((m) => m.home.id === teamId || m.away.id === teamId))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }, [followedTeamIds, matches]);

  const biggestMoverEvent = useMemo(() => {
    if (changeEvents.length === 0) return null;
    return [...changeEvents].sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))[0];
  }, [changeEvents]);
  const biggestMoverMatch = useMemo(
    () => (biggestMoverEvent ? matches.find((m) => m.id === biggestMoverEvent.matchId) : null),
    [biggestMoverEvent, matches],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingSmall}>{t('home.goodEvening')}</Text>
            <Text style={styles.greetingName}>{name}</Text>
          </View>
          <Pressable style={styles.premiumButton} onPress={() => router.push('/(tabs)/premium')}>
            <SparkleIcon size={14} weight="bold" color={colors.primaryLink} />
            <Text style={styles.premiumButtonText}>{t('tabs.premium')}</Text>
          </Pressable>
        </View>

        <SegmentedControl
          style={styles.sportSegment}
          options={[
            { key: 'football', label: t('home.football'), icon: <SoccerBallIcon size={14} weight="bold" color={colors.textSecondary} /> },
            { key: 'basketball', label: t('home.basketball'), icon: <BasketballIcon size={14} weight="bold" color={colors.textSecondary} /> },
          ]}
          value={selectedSport}
          onChange={(key) => setSelectedSport(key as Sport)}
        />

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.kicker}>{t('home.matchOfTheDay')}</Text>
          <View style={styles.sectionHeaderRight}>
            {!loading && !isLive && (
              <View style={styles.liveRow}>
                <View style={[styles.liveDot, { backgroundColor: colors.warning }]} />
                <Text style={styles.liveText}>{t('home.demoData')}</Text>
              </View>
            )}
            <Pressable style={styles.viewAllLink} onPress={() => router.push('/(tabs)/explore')}>
              <Text style={styles.viewAllLinkText}>{t('common.viewAll')}</Text>
              <ArrowRightIcon size={11} weight="bold" color={colors.primaryLink} />
            </Pressable>
          </View>
        </View>

        {heroMatches.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.heroScroll}
            contentContainerStyle={{ gap: 12, paddingHorizontal: spacing.screenX }}
            decelerationRate="fast"
            snapToInterval={heroCardWidth + 12}
            snapToAlignment="start"
          >
            {heroMatches.map((match) => {
              const favourite = favouredOutcome(match);
              const topFactor = [...match.factors].sort((a, b) => Math.abs(b.home - 50) - Math.abs(a.home - 50))[0] ?? null;
              return (
                <Pressable
                  key={match.id}
                  style={[styles.hero, { width: heroCardWidth }]}
                  onPress={() => router.push(`/match/${match.id}`)}
                >
                  <Text style={styles.heroCompetition}>{match.competition}</Text>
                  <View style={styles.heroRow}>
                    <View style={styles.heroInfo}>
                      <TeamBadgePair home={match.home} away={match.away} size={30} />
                      <Text style={styles.heroTitle}>
                        {match.home.name}
                        {'\n'}
                        <Text style={styles.heroVs}>{t('common.vs')}</Text> {match.away.name}
                      </Text>
                      <Text style={styles.heroSubtitle}>{match.kickoff}</Text>
                    </View>
                    <ConfidenceRing value={favourite.probability} caption={t('matchAnalysis.confidenceCaption')} />
                  </View>
                  {topFactor && (
                    <View style={styles.heroReasonRow}>
                      <LightningIcon size={13} weight="bold" color={colors.primary} />
                      <Text style={styles.heroReasonText}>
                        {t('home.heroReason', {
                          team: topFactor.home >= topFactor.away ? match.home.name : match.away.name,
                          factor: t(`factors.${topFactor.key}`).toLowerCase(),
                        })}
                      </Text>
                      <ArrowRightIcon size={14} weight="bold" color={colors.primary} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.emptySportText}>{t('home.noMatchesForSport')}</Text>
        )}

        {followingRows.length > 0 && (
          <>
            <Text style={[styles.kicker, styles.sectionSpacer]}>{t('insights.followingKicker')}</Text>
            <View style={styles.matchListGroup}>
              {followingRows.map((match) => {
                const favourite = favouredOutcome(match);
                return (
                  <Pressable key={match.id} style={styles.matchRow} onPress={() => router.push(`/match/${match.id}`)}>
                    <View style={styles.matchRowInfo}>
                      <Text style={styles.matchRowTeams} numberOfLines={1}>
                        {match.home.name} <Text style={styles.heroVs}>{t('common.vs')}</Text> {match.away.name}
                      </Text>
                      <Text style={styles.matchRowSubtitle} numberOfLines={1}>
                        {match.competition} · {match.kickoff}
                      </Text>
                    </View>
                    <View style={styles.matchRowChip}>
                      <Text style={[styles.matchRowChipText, { color: confidenceColor(favourite.probability) }]}>
                        {favourite.probability}%
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {biggestMoverEvent && biggestMoverMatch && (
          <Pressable onPress={() => router.push(`/match/${biggestMoverEvent.matchId}?tab=change`)}>
            <LinearGradient
              colors={[colors.highlightBg, colors.highlightBgAlt]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.highlightCard}
            >
              <SoccerBallIcon
                size={130}
                weight="fill"
                color="rgba(255,255,255,0.035)"
                style={styles.highlightBallIcon}
              />
              <View style={styles.highlightLabelRow}>
                <ArrowsClockwiseIcon size={13} weight="bold" color={colors.highlightAccent} />
                <Text style={styles.highlightLabel}>{t('home.recentChangeKicker')}</Text>
              </View>
              <Text style={styles.highlightMatchup}>
                {biggestMoverMatch.home.name} <Text style={styles.heroVs}>{t('common.vs')}</Text> {biggestMoverMatch.away.name}
              </Text>
              <Text style={styles.highlightSubtitle}>
                {t('home.recentChangeDetail', {
                  change: t(`changeEvents.${biggestMoverEvent.key}`),
                  from: biggestMoverEvent.from,
                  to: biggestMoverEvent.to,
                })}
              </Text>
              <Text style={styles.highlightLink}>
                {t('common.viewFullAnalysis')} <ArrowRightIcon size={12} weight="bold" color={colors.highlightText} />
              </Text>
            </LinearGradient>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 120, paddingTop: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  greetingSmall: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginBottom: 3 },
  greetingName: { fontFamily: fonts.headline, fontSize: 26, letterSpacing: -0.6, color: colors.textPrimary },
  premiumButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderHover,
    backgroundColor: colors.primaryTint,
  },
  premiumButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primaryLink },
  sportSegment: { marginBottom: spacing.lg },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionSpacer: { marginTop: spacing.xl, marginBottom: 9 },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textFaint },
  matchListGroup: { gap: 8, marginBottom: spacing.xxl },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  matchRowInfo: { flex: 1 },
  matchRowTeams: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  matchRowSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiaryAlt, marginTop: 2 },
  matchRowChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderHover,
  },
  matchRowChipText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textTertiary },
  heroScroll: { marginHorizontal: -spacing.screenX, marginBottom: spacing.xxl },
  hero: {
    borderWidth: 1,
    borderColor: colors.borderAccent,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: 18,
  },
  heroCompetition: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.primary },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  heroInfo: { flex: 1 },
  heroTitle: { fontFamily: fonts.headline, fontSize: 17, lineHeight: 22, letterSpacing: -0.4, color: colors.textPrimary, marginTop: 8, marginBottom: 4 },
  heroVs: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFainter },
  heroSubtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiaryAlt },
  heroReasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  heroReasonText: { flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondaryAlt },
  emptySportText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginBottom: spacing.xxl },
  viewAllLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primaryLink },
  highlightCard: {
    borderRadius: radius.md,
    padding: 16,
    marginTop: spacing.md,
    overflow: 'hidden',
    position: 'relative',
  },
  highlightBallIcon: { position: 'absolute', top: -30, right: -34 },
  highlightLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  highlightLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.highlightText },
  highlightMatchup: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.highlightText, marginBottom: 4 },
  highlightSubtitle: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.highlightTextMuted, marginBottom: 10 },
  highlightLink: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.highlightText },
});
