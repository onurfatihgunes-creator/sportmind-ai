import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightIcon,
  BasketballIcon,
  LightningIcon,
  PlusIcon,
  SoccerBallIcon,
  SparkleIcon,
  TrayIcon,
} from 'phosphor-react-native';
import { colors, confidenceColor, fonts, radius, spacing, toneColor, toneMutedColor, toneTextColor } from '@/constants/theme';
import { favouredOutcome, type Match, type Sport } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import { useFollowedTeams } from '@/contexts/FollowedTeamsContext';
import { useProfile } from '@/contexts/ProfileContext';
import ConfidenceRing from '@/components/ConfidenceRing';
import SegmentedControl from '@/components/SegmentedControl';
import TeamBadgePair from '@/components/TeamBadgePair';
import StackedDistributionBar from '@/components/StackedDistributionBar';

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

  // "What stands out" — deterministic, and on a genuinely different axis from the
  // Highlights carousel above (which ranks by raw prediction confidence): the single
  // match whose strongest real factor has the largest magnitude (|factor.home - 50|),
  // i.e. the analysis with the clearest single driver. Ties broken by confidence.
  // Requires at least one real factor — a match with none can never be selected — and
  // if nothing in the current sport qualifies, the section is hidden rather than
  // guessing or falling back to a random/popular team.
  const standout = useMemo(() => {
    let bestMatch: Match | null = null;
    let bestFactor: Match['factors'][number] | null = null;
    let bestMagnitude = -1;
    for (const m of sportMatches) {
      if (m.factors.length === 0) continue;
      const topFactor = [...m.factors].sort((a, b) => Math.abs(b.home - 50) - Math.abs(a.home - 50))[0];
      const magnitude = Math.abs(topFactor.home - 50);
      const better =
        magnitude > bestMagnitude ||
        (magnitude === bestMagnitude && bestMatch && favouredOutcome(m).probability > favouredOutcome(bestMatch).probability);
      if (better) {
        bestMatch = m;
        bestFactor = topFactor;
        bestMagnitude = magnitude;
      }
    }
    return bestMatch && bestFactor ? { match: bestMatch, factor: bestFactor } : null;
  }, [sportMatches]);

  // Personalised, not a duplicate of Today's highlights above — this surfaces each
  // followed team's own next match regardless of sport/competition, so a team with no
  // upcoming match in the loaded window simply produces no row rather than an awkward
  // placeholder.
  const followingRows = useMemo(() => {
    return followedTeamIds
      .map((teamId) => {
        const match = matches.find((m) => m.home.id === teamId || m.away.id === teamId);
        if (!match) return null;
        const myTeam = match.home.id === teamId ? match.home : match.away;
        const opponent = match.home.id === teamId ? match.away : match.home;
        return { match, myTeam, opponent };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [followedTeamIds, matches]);

  // Up to 3 most material real changes, most significant first — never padded, never
  // invented; an empty list renders the honest empty state below instead of nothing.
  const recentChanges = useMemo(() => {
    return [...changeEvents]
      .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
      .slice(0, 3)
      .map((event) => ({ event, match: matches.find((m) => m.id === event.matchId) }))
      .filter((row): row is { event: (typeof changeEvents)[number]; match: Match } => Boolean(row.match));
  }, [changeEvents, matches]);

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
              const isBasketball = match.sport === 'basketball';
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
                  <StackedDistributionBar
                    home={match.outcomes.home}
                    draw={isBasketball ? 0 : match.outcomes.draw}
                    away={match.outcomes.away}
                    height={26}
                  />
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

        {standout && (
          <>
            <Text style={[styles.kicker, styles.sectionSpacer]}>{t('home.standoutKicker')}</Text>
            <Pressable
              style={styles.standoutCard}
              onPress={() => router.push(`/match/${standout.match.id}?tab=reasons`)}
            >
              <View style={styles.standoutTop}>
                <TeamBadgePair home={standout.match.home} away={standout.match.away} size={28} />
                <View style={styles.standoutInfo}>
                  <Text style={styles.standoutTitle} numberOfLines={1}>
                    {standout.match.home.name} <Text style={styles.heroVs}>{t('common.vs')}</Text> {standout.match.away.name}
                  </Text>
                  <Text style={styles.standoutSubtitle} numberOfLines={2}>
                    {t('home.standoutExplanation', {
                      team: standout.factor.home >= standout.factor.away ? standout.match.home.name : standout.match.away.name,
                      factor: t(`factors.${standout.factor.key}`).toLowerCase(),
                    })}
                  </Text>
                </View>
              </View>
              <StackedDistributionBar
                home={standout.match.outcomes.home}
                draw={standout.match.sport === 'basketball' ? 0 : standout.match.outcomes.draw}
                away={standout.match.outcomes.away}
                height={24}
              />
              <View style={styles.standoutLinkRow}>
                <Text style={styles.standoutLinkText}>{t('common.viewFullAnalysis')}</Text>
                <ArrowRightIcon size={12} weight="bold" color={colors.primaryLink} />
              </View>
            </Pressable>
          </>
        )}

        <Text style={[styles.kicker, styles.sectionSpacer]}>{t('insights.followingKicker')}</Text>
        {followingRows.length > 0 ? (
          <View style={styles.matchListGroup}>
            {followingRows.map(({ match, myTeam, opponent }) => {
              const favourite = favouredOutcome(match);
              return (
                <Pressable key={match.id} style={styles.matchRow} onPress={() => router.push(`/match/${match.id}`)}>
                  <View style={styles.matchRowInfo}>
                    <Text style={styles.matchRowTeams} numberOfLines={1}>
                      {myTeam.name}
                    </Text>
                    <Text style={styles.matchRowSubtitle} numberOfLines={1}>
                      {t('home.followingNextMatch', { opponent: opponent.name, kickoff: match.kickoff })}
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
        ) : (
          <Pressable style={styles.followCta} onPress={() => router.push('/(tabs)/insights')}>
            <View style={styles.followCtaIcon}>
              <PlusIcon size={16} weight="bold" color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.followCtaTitle}>{t('home.followTitle')}</Text>
              <Text style={styles.followCtaBody}>{t('home.followBody')}</Text>
            </View>
            <View style={styles.followCtaButton}>
              <Text style={styles.followCtaButtonText}>{t('home.followButton')}</Text>
            </View>
          </Pressable>
        )}

        <Text style={[styles.kicker, styles.sectionSpacer]}>{t('home.recentChangeKicker')}</Text>
        {recentChanges.length > 0 ? (
          <View style={styles.matchListGroup}>
            {recentChanges.map(({ event, match }) => {
              const delta = event.to - event.from;
              return (
                <Pressable
                  key={event.id}
                  style={styles.changeRow}
                  onPress={() => router.push(`/match/${event.matchId}?tab=change`)}
                >
                  <View style={[styles.changeDot, { backgroundColor: toneColor(event.tone) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.changeMatchup} numberOfLines={1}>
                      {match.home.name} <Text style={styles.heroVs}>{t('common.vs')}</Text> {match.away.name}
                    </Text>
                    <Text style={styles.changeDescription} numberOfLines={1}>
                      {t(`changeEvents.${event.key}`)}
                    </Text>
                  </View>
                  <View style={[styles.deltaChip, { backgroundColor: toneMutedColor(event.tone) }]}>
                    <Text style={[styles.deltaChipText, { color: toneTextColor(event.tone) }]}>
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </Text>
                  </View>
                  <ArrowRightIcon size={13} weight="bold" color={colors.textFainter} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.changesEmptyCard}>
            <View style={styles.changesEmptyIcon}>
              <TrayIcon size={16} weight="bold" color={colors.textFainter} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.changesEmptyTitle}>{t('home.recentChangesEmptyTitle')}</Text>
              <Text style={styles.changesEmptyBody}>{t('home.recentChangesEmptyBody')}</Text>
            </View>
          </View>
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
  matchRowTeams: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
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
    gap: 14,
  },
  heroCompetition: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: colors.primary },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroInfo: { flex: 1 },
  heroTitle: { fontFamily: fonts.headline, fontSize: 17, lineHeight: 22, letterSpacing: -0.4, color: colors.textPrimary, marginTop: 8, marginBottom: 4 },
  heroVs: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFainter },
  heroSubtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiaryAlt },
  heroReasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  heroReasonText: { flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondaryAlt },
  emptySportText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginBottom: spacing.xxl },
  viewAllLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primaryLink },

  standoutCard: {
    borderWidth: 1,
    borderColor: colors.borderAccent,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
    marginBottom: spacing.xxl,
  },
  standoutTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  standoutInfo: { flex: 1 },
  standoutTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary, marginBottom: 3 },
  standoutSubtitle: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondaryAlt },
  standoutLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  standoutLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primaryLink },

  followCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderHover,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: spacing.xxl,
  },
  followCtaIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  followCtaTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary, marginBottom: 2 },
  followCtaBody: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  followCtaButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.borderHover,
  },
  followCtaButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.primaryLink },

  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  changeDot: { width: 7, height: 7, borderRadius: 4 },
  changeMatchup: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  changeDescription: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 1 },
  deltaChip: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  deltaChipText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  changesEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSubtle,
    padding: 13,
    marginBottom: spacing.xxl,
  },
  changesEmptyIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  changesEmptyTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondaryAlt, marginBottom: 1 },
  changesEmptyBody: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
});
