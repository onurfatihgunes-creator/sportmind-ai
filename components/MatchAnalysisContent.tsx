import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  ClockCounterClockwiseIcon,
  ShieldCheckIcon,
  SparkleIcon,
  WarningCircleIcon,
} from 'phosphor-react-native';
import { fonts, radius, type ThemeColors } from '@/constants/theme';
import type { PaneCount } from '@/constants/layout';
import { favouredOutcome, type Match } from '@/data/mockData';
import { matchFormDataLevel } from '@/data/dataConfidence';
import { compactTeamName } from '@/data/teamLabel';
import { deriveSportMindView } from '@/data/sportMindView';
import { useAppData } from '@/contexts/DataContext';
import SegmentedControl from '@/components/SegmentedControl';
import SplitPane from '@/components/SplitPane';
import ConfidenceRing from '@/components/ConfidenceRing';
import StackedDistributionBar from '@/components/StackedDistributionBar';
import FactorBar from '@/components/FactorBar';
import ChangeTimeline from '@/components/ChangeTimeline';
import Disclaimer from '@/components/Disclaimer';
import { useAppTheme } from '@/contexts/ThemeContext';
import { isRTLLayout } from '@/hooks/useAdaptiveLayout';
import TeamAvatar from '@/components/TeamAvatar';

export type MatchAnalysisTab = 'summary' | 'reasons' | 'change';

/** The largest the system font scale may make the text in the narrow columns (matchup header,
 *  legend, expected goals). Beyond this the layout adapts instead of the words running out of
 *  their column; the headline numbers are not capped by anything but this same ceiling. */
const MAX_TEXT_SCALE = 1.3;
/** Both team names reserve two lines, so a one-line name leaves its space below it and the
 *  two columns of the matchup header keep the same shape. */
const TEAM_NAME_LINES = 2;
const TEAM_NAME_LINE_HEIGHT = 16;

/** Below this many "text-scale-1" dp of matchup-card width the three-column header and the
 *  full club names no longer fit, so the screen switches to the compact arrangement. */
const TIGHT_CARD_WIDTH = 290;
/** Page gutter + card border, used only until the card has been measured. */
const CARD_CHROME = 42;

type Props = {
  match: Match;
  tab: MatchAnalysisTab;
  onTabChange: (tab: MatchAnalysisTab) => void;
  /**
   * How many columns this content may use. Decided by whoever is laying it out from the
   * width THEY have, not from the window: as the full /match/[id] route that is the whole
   * content width, but inside Explore's detail pane it is roughly half of it, and there
   * the analysis must stay one column.
   */
  columns: PaneCount;
};

/**
 * The body of Match Analysis, extracted from app/match/[id].tsx so the route screen and
 * Explore's wide-window detail pane render the exact same analysis rather than a Duo copy
 * of it. Route concerns stay behind in the route: resolving the id against Supabase when
 * it has rotated out of the loaded window, the not-found state, the Pro gate, the header
 * and the watchlist toggle. This component only ever renders a Match it was handed, and
 * fetches nothing.
 *
 * The selected tab is controlled by the caller for the same reason SplitPane takes a
 * `dual` prop: state that lives above the layout branch survives a fold, a rotation, or
 * a Split View resize untouched.
 *
 * On a wide window this becomes the DATA -> INTERPRETATION pairing the screen already
 * implies vertically — the matchup, the win probability and the outcome distribution on
 * one side, and SportMind's reading of them (why, what changed, its own view) on the
 * other — so both are on screen at once instead of one scrolling the other away.
 */
export default function MatchAnalysisContent({ match, tab, onTabChange, columns }: Props) {
  const { t } = useTranslation();
  const { changeEvents } = useAppData();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Whether the matchup fits its three-column header and full club names is a question of
  // the width this content really has (a phone, or half of Explore's wide detail pane) against
  // the text size the person chose — so it is measured, not guessed from the window.
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [cardWidth, setCardWidth] = useState(0);
  const textScale = Math.min(Math.max(fontScale, 1), MAX_TEXT_SCALE);
  const availableWidth = cardWidth > 0 ? cardWidth : windowWidth - CARD_CHROME;
  const tight = availableWidth / textScale < TIGHT_CARD_WIDTH;
  const shortName = (name: string) => (tight ? compactTeamName(name) : name);
  const onCardLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setCardWidth((prev) => (prev === w ? prev : w));
  };

  const dual = columns === 'dual';
  const favourite = favouredOutcome(match);
  const isBasketball = match.sport === 'basketball';
  const formatStat = (value: number) => (isBasketball ? Math.round(value).toString() : value.toFixed(1));

  const matchChangeEvents = useMemo(
    () => changeEvents.filter((e) => e.matchId === match.id),
    [changeEvents, match.id],
  );

  const factorsByStrength = useMemo(
    () => [...match.factors].sort((a, b) => Math.abs(b.home - 50) - Math.abs(a.home - 50)),
    [match],
  );
  const mostDecisiveKey = factorsByStrength[0]?.key;
  // Same >=3-real-matches bar as everywhere else that judges form sample size (see
  // data/dataConfidence.ts) — was previously just ">0 vs 0" here, which missed a team
  // with only 1-2 recorded matches (a real, thin-but-nonzero case, not hypothetical).
  const formDataLevel = matchFormDataLevel(match.home.form, match.away.form);
  const sportMindView = useMemo(() => deriveSportMindView(match, formDataLevel), [match, formDataLevel]);

  const renderTeam = (team: Match['home']) => (
    <View style={styles.teamCol}>
      <Pressable
        style={styles.teamProfileTouchable}
        onPress={() => router.push(`/team/${team.id}`)}
        accessibilityRole="button"
        accessibilityLabel={team.name}
      >
        <TeamAvatar team={team} size={38} style={styles.crest} />
        <Text
          style={[styles.teamName, { minHeight: TEAM_NAME_LINES * TEAM_NAME_LINE_HEIGHT * textScale }]}
          numberOfLines={TEAM_NAME_LINES}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {shortName(team.name)}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.teamInsightsCta, pressed && styles.teamInsightsCtaPressed]}
        onPress={() => router.push(`/team-insights/${team.id}`)}
        accessibilityRole="button"
        accessibilityLabel={t('matchAnalysis.teamInsightsCtaLabel', { team: team.name })}
      >
        <Text
          style={styles.teamInsightsCtaText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          maxFontSizeMultiplier={1.15}
        >
          {t('matchAnalysis.teamInsightsCta')}
        </Text>
        <ArrowRightIcon size={11} weight="bold" color={colors.highlightText} />
      </Pressable>
    </View>
  );

  const context = (
    <>
      <View style={styles.matchupCard} onLayout={onCardLayout}>
        {tight && (
          <View style={styles.kickoffRowTight}>
            <Text style={styles.kickoffDay} maxFontSizeMultiplier={MAX_TEXT_SCALE}>{match.kickoff.split(',')[0]}</Text>
            <Text style={styles.kickoffTime} maxFontSizeMultiplier={MAX_TEXT_SCALE}>{match.kickoff.split(',')[1]?.trim()}</Text>
          </View>
        )}
        <View style={styles.matchupRow}>
          {renderTeam(match.home)}
          {!tight && (
            <View style={styles.kickoffCol}>
              <Text style={styles.kickoffDay} maxFontSizeMultiplier={MAX_TEXT_SCALE}>{match.kickoff.split(',')[0]}</Text>
              <Text style={styles.kickoffTime} maxFontSizeMultiplier={MAX_TEXT_SCALE}>{match.kickoff.split(',')[1]?.trim()}</Text>
            </View>
          )}
          {renderTeam(match.away)}
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <ConfidenceRing
            value={favourite.probability}
            size={tight ? 96 : 112}
            strokeWidth={tight ? 8 : 9}
            caption={t('matchAnalysis.winProbabilityCaption')}
            favoredSide={favourite.label === 'draw' ? undefined : favourite.label}
          />
          <View style={styles.heroInfo}>
            <Text style={styles.heroLine} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
              {favourite.team
                ? t('matchAnalysis.teamWinProbability', { team: shortName(favourite.team.name) })
                : t('matchAnalysis.drawProbabilityLine')}
            </Text>
            {formDataLevel !== 'full' ? (
              // The win-probability ring above looks equally confident regardless of
              // how much real history backs it — but a team with little or no recorded
              // recent form (confirmed live: newly-tracked teams like Feyenoord/FC
              // Porto) is a materially thinner basis than one with a full sample. This
              // doesn't change the number itself (that stays the deterministic engine's
              // own output), it only makes the data behind it as honest as the number.
              <View style={styles.limitedDataBadge}>
                <WarningCircleIcon size={12} weight="bold" color={colors.warningText} />
                <Text style={styles.limitedDataBadgeText}>{t('matchAnalysis.limitedDataNote')}</Text>
              </View>
            ) : (
              // The caption used to be unconditional ("prediction stability, tracked
              // since the last change") regardless of whether matchChangeEvents was
              // actually empty — so it kept claiming to be "tracking since the last
              // change" even on a match that HAD one, or under limited data, where it
              // isn't the relevant story at all. Moved inside the one condition it's
              // actually true for, right where the badge itself already lived — same
              // condition, so the two can never disagree with each other again.
              matchChangeEvents.length === 0 && (
                <>
                  <Text style={styles.heroCaption}>{t('matchAnalysis.predictionStability')}</Text>
                  <View style={styles.stabilityBadge}>
                    <ShieldCheckIcon size={12} weight="bold" color={colors.successText} />
                    <Text style={styles.stabilityBadgeText}>{t('matchAnalysis.highStability')}</Text>
                  </View>
                </>
              )
            )}
          </View>
        </View>

        <Text style={styles.kicker}>{t('matchAnalysis.expectedOutcomeDistribution')}</Text>
        <StackedDistributionBar home={match.outcomes.home} draw={isBasketball ? 0 : match.outcomes.draw} away={match.outcomes.away} />
        <View style={styles.outcomeLegendRow}>
          <View style={[styles.outcomeLegendCell, { alignItems: 'flex-start' }]}>
            <Text style={styles.outcomeLegendText} numberOfLines={3} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
              {shortName(match.home.name)}
            </Text>
          </View>
          {!isBasketball && (
            <View style={styles.outcomeLegendDraw}>
              <Text style={styles.outcomeLegendText} numberOfLines={1} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
                {t('matchAnalysis.draw')}
              </Text>
            </View>
          )}
          <View style={[styles.outcomeLegendCell, { alignItems: 'flex-end' }]}>
            <Text
              style={[styles.outcomeLegendText, { textAlign: isRTLLayout() ? 'left' : 'right' }]}
              numberOfLines={3}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {shortName(match.away.name)}
            </Text>
          </View>
        </View>
      </View>
    </>
  );

  const interpretation = (
    <>
      <SegmentedControl
        // Side by side the two columns must start on the same line: the context column
        // opens with the matchup card's own 6pt top margin, so the tab strip drops its
        // stacked-layout 18pt breathing room to match it rather than sitting lower.
        style={[styles.tabSegment, dual && styles.tabSegmentDual]}
        options={[
          { key: 'summary', label: t('matchAnalysis.tabSummary') },
          { key: 'reasons', label: t('matchAnalysis.tabReasons') },
          { key: 'change', label: t('matchAnalysis.tabChange') },
        ]}
        value={tab}
        onChange={(k) => onTabChange(k as MatchAnalysisTab)}
        fontSize={12}
        fill={tight}
      />

      {tab === 'summary' && (
        <View style={{ gap: 10 }}>
          {formDataLevel !== 'none' ? (
            <>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>{t(isBasketball ? 'matchAnalysis.expectedPoints' : 'matchAnalysis.expectedGoals')}</Text>
                <View style={styles.xgSplit}>
                  <View style={styles.xgSide}>
                    <View style={styles.xgValueRow}>
                      <Text style={styles.xgValue} maxFontSizeMultiplier={MAX_TEXT_SCALE}>{formatStat(match.xgHome)}</Text>
                      <Text style={styles.xgTeam} numberOfLines={2} maxFontSizeMultiplier={MAX_TEXT_SCALE}>{shortName(match.home.name)}</Text>
                    </View>
                    <View style={styles.xgTrack}>
                      <View style={[styles.xgFill, { width: `${(match.xgHome / (match.xgHome + match.xgAway)) * 100}%`, backgroundColor: colors.primary }]} />
                    </View>
                  </View>
                  <View style={styles.xgDivider} />
                  <View style={styles.xgSide}>
                    <View style={styles.xgValueRow}>
                      <Text style={styles.xgValue} maxFontSizeMultiplier={MAX_TEXT_SCALE}>{formatStat(match.xgAway)}</Text>
                      <Text style={styles.xgTeam} numberOfLines={2} maxFontSizeMultiplier={MAX_TEXT_SCALE}>{shortName(match.away.name)}</Text>
                    </View>
                    <View style={styles.xgTrack}>
                      <View style={[styles.xgFill, { width: `${(match.xgAway / (match.xgHome + match.xgAway)) * 100}%`, backgroundColor: colors.neutralSeries }]} />
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardLabel}>{t(isBasketball ? 'matchAnalysis.combinedExpectedPoints' : 'matchAnalysis.combinedExpectedGoals')}</Text>
                <Text style={styles.statPairValue}>{formatStat(match.xgHome + match.xgAway)}</Text>
              </View>
            </>
          ) : (
            // Intelligence 6.1: match.xgHome/xgAway are derived from the same team_form
            // stats as the "Recent form" row below — when one team has zero real matches
            // (formDataLevel 'none'), those numbers are the neutral-baseline placeholder
            // blended with the other team's real average, not real evidence for either
            // team specifically (confirmed live: Feyenoord Rotterdam showing a specific
            // "1.1" expected-goals figure with zero recorded matches behind it). The
            // prediction itself still needs this number internally to stay a valid,
            // always-computable probability (see computePredictions.ts's buildPrediction)
            // — this only stops it from being presented to the user as real evidence.
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t(isBasketball ? 'matchAnalysis.expectedPoints' : 'matchAnalysis.expectedGoals')}</Text>
              <Text style={styles.formEmptyText}>{t('matchAnalysis.noXgData')}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('matchAnalysis.recentFormOldToNew')}</Text>
            <FormRow name={match.home.name} form={match.home.form} />
            <FormRow name={match.away.name} form={match.away.form} />
          </View>
        </View>
      )}

      {tab === 'reasons' && (
        <View style={styles.card}>
          <Text style={styles.whyTitle}>{t('matchAnalysis.whyDoesAiThink')}</Text>
          <Text style={styles.whySubtitle}>{t('matchAnalysis.factorsWeighted', { count: match.factors.length })}</Text>
          <View style={{ gap: 16, marginTop: 4 }}>
            {factorsByStrength.map((factor, index) => {
              const diff = factor.home - 50;
              const qualifier =
                factor.key === mostDecisiveKey
                  ? t('matchAnalysis.mostDecisive')
                  : Math.abs(diff) <= 3
                    ? t('matchAnalysis.balanced')
                    : t('matchAnalysis.favours', { team: shortName(diff > 0 ? match.home.name : match.away.name) });
              return (
                <FactorBar
                  key={factor.key}
                  label={t(`factors.${factor.key}`)}
                  homePct={factor.home}
                  awayPct={factor.away}
                  homeName={shortName(match.home.name)}
                  awayName={shortName(match.away.name)}
                  qualifier={qualifier}
                  highlighted={factor.key === mostDecisiveKey}
                  delay={index * 60}
                />
              );
            })}
          </View>
          <Text style={styles.methodologyNote}>{t('matchAnalysis.methodologyNote')}</Text>
        </View>
      )}

      {tab === 'change' && (
        <View style={styles.card}>
          <View style={styles.whyTitleRow}>
            <View style={styles.whyTitleIconCircle}>
              <ClockCounterClockwiseIcon size={15} weight="bold" color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.whyTitle}>{t('whatChanged.title')}</Text>
              <Text style={[styles.whySubtitle, { marginBottom: 0 }]}>{t('whatChanged.onlyMaterialChanges')}</Text>
            </View>
          </View>
          <View style={{ marginTop: 16 }}>
            <ChangeTimeline events={matchChangeEvents} ArrowIcon={ArrowRightIcon} emptyText={t('whatChanged.empty')} />
          </View>
        </View>
      )}

      {sportMindView && (
        <View style={styles.sportMindCard}>
          <View style={styles.sportMindTitleRow}>
            <SparkleIcon size={14} weight="bold" color={colors.primary} />
            <Text style={styles.whyTitle}>{t('sportMindView.title')}</Text>
          </View>
          <View style={{ gap: 6 }}>
            {sportMindView.lines.map((line, index) => (
              <Text key={index} style={styles.sportMindViewText}>
                {t(`sportMindView.${line.key}`, line.team ? { team: line.team } : undefined)}
              </Text>
            ))}
          </View>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.compareButton, pressed && styles.compareButtonPressed]}
        onPress={() => router.push({ pathname: '/team-comparison', params: { a: match.home.id, b: match.away.id } })}
      >
        <ArrowsLeftRightIcon size={15} weight="bold" color={colors.primaryLink} />
        <Text style={styles.compareButtonText}>{t('matchAnalysis.compareTeams', { a: match.home.name, b: match.away.name })}</Text>
        <ArrowRightIcon size={13} weight="bold" color={colors.primaryLink} />
      </Pressable>
    </>
  );

  return (
    <>
      <SplitPane dual={dual} primary={context} secondary={interpretation} primaryFlex={1} secondaryFlex={1.15} />
      <Disclaimer />
    </>
  );
}

// Some real teams (confirmed live: e.g. Feyenoord Rotterdam, FC Porto — newly-tracked
// teams with no finished matches recorded anywhere yet, not a query/rendering bug) have
// zero team_form rows, so `form` can legitimately be empty. Rendered as an explicit,
// localized empty state rather than a silently blank row — never a fabricated result.
function FormRow({ name, form }: { name: string; form: ('W' | 'D' | 'L')[] }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const tone = { W: { bg: colors.successMuted, fg: colors.successText }, D: { bg: colors.divider, fg: colors.textSecondaryAlt }, L: { bg: colors.dangerMuted, fg: colors.dangerText } };
  return (
    <View style={styles.formRow}>
      <Text style={styles.formTeamName}>{name}</Text>
      {form.length === 0 ? (
        <Text style={styles.formEmptyText}>{t('matchAnalysis.noRecentResults')}</Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {form.map((r, i) => (
            <View key={i} style={[styles.formTile, { backgroundColor: tone[r].bg }]}>
              <Text style={[styles.formTileText, { color: tone[r].fg }]}>{t(`teamProfile.form${r}`)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  matchupCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    marginTop: 6,
  },
  matchupRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  // minWidth 0: a flex child will not shrink below its content's natural width unless told it
  // may, which is how a long club name used to push the whole column past the card.
  // Name block on top, AI Insights pill pinned to the bottom: the two columns are the same height,
  // so the pills line up whatever the names wrap to.
  teamCol: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'space-between' },
  kickoffRowTight: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginBottom: 12 },
  teamProfileTouchable: { alignItems: 'center', alignSelf: 'stretch' },
  crest: { marginBottom: 6 },
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: TEAM_NAME_LINE_HEIGHT, color: colors.textPrimary, textAlign: 'center' },
  teamInsightsCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    maxWidth: '100%',
  },
  teamInsightsCtaPressed: { backgroundColor: colors.primaryLinkHover },
  // fontSize/letterSpacing trimmed from 11/0.3 — at 375px width, "AI INSIGHTS" (English)
  // clipped to "AI INSIG…" inside this pill's share of a flex:1 team column (confirmed
  // live); Turkish/Arabic already fit. Smallest change that gives English back its full
  // label without touching the card's layout/columns.
  teamInsightsCtaText: {
    flexShrink: 1,
    textAlign: 'center',
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.15,
    textTransform: 'uppercase',
    color: colors.highlightText,
  },
  kickoffCol: { alignItems: 'center', alignSelf: 'center', flexShrink: 0, paddingHorizontal: 4 },
  kickoffDay: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFainter },
  kickoffTime: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },
  hero: {
    marginTop: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 },
  heroInfo: { flex: 1, minWidth: 0 },
  heroLine: { fontFamily: fonts.headline, fontSize: 16, lineHeight: 21, letterSpacing: -0.3, color: colors.textPrimary, marginBottom: 6 },
  heroCaption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textTertiary, marginBottom: 10 },
  stabilityBadge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 5, backgroundColor: colors.successMuted, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  stabilityBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: colors.successText },
  limitedDataBadge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 5, backgroundColor: colors.warningMuted, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  limitedDataBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: colors.warningText },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 8 },
  // Three labels under the bar. They were one non-wrapping row with space-between, so two long
  // team names (plus "Draw") were wider than the card and ran off its edge at larger font
  // scales. Home/away now take equal shares and wrap to two lines; the draw label keeps its width.
  outcomeLegendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 7 },
  outcomeLegendCell: { flex: 1, minWidth: 0 },
  outcomeLegendDraw: { flexShrink: 0 },
  outcomeLegendText: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiaryAlt },
  tabSegment: { marginTop: 18, marginBottom: 14, alignSelf: 'flex-start' },
  tabSegmentDual: { marginTop: 6 },
  card: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  cardLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginBottom: 10 },
  xgSplit: { flexDirection: 'row', gap: 16 },
  xgSide: { flex: 1, minWidth: 0 },
  // The team name sits beside the number while it fits and drops under it when it does not
  // (wrap), instead of running into the neighbouring column. It may shrink to the column width
  // and wrap onto a second line; the number never shrinks or truncates.
  xgValueRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, rowGap: 1, marginBottom: 6 },
  xgValue: { fontFamily: fonts.headline, fontSize: 22, letterSpacing: -0.4, color: colors.textPrimary },
  xgTeam: { flexShrink: 1, maxWidth: '100%', fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 15, color: colors.textTertiaryAlt },
  xgTrack: { height: 5, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' },
  xgFill: { height: '100%', borderRadius: 3 },
  xgDivider: { width: 1, backgroundColor: colors.border },
  statPairValue: { fontFamily: fonts.headline, fontSize: 22, letterSpacing: -0.4, color: colors.textPrimary },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  formTeamName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textPrimary },
  formEmptyText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  formTile: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  formTileText: { fontFamily: fonts.bodyBold, fontSize: 10 },
  whyTitle: { fontFamily: fonts.headline, fontSize: 15, color: colors.textPrimary, marginBottom: 3 },
  sportMindTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sportMindCard: {
    marginTop: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
  },
  sportMindViewText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondaryAlt },
  whySubtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginBottom: 18 },
  whyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  whyTitleIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  methodologyNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textTertiary, marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.divider },
  compareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    backgroundColor: colors.primaryTint,
  },
  compareButtonPressed: { backgroundColor: colors.primaryTintStrong },
  compareButtonText: { flexShrink: 1, fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.primaryLink, textAlign: 'center' },
});
