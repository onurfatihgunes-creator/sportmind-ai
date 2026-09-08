import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useAppData } from '@/contexts/DataContext';
import { useFollowedTeams, MAX_FOLLOWED_TEAMS } from '@/contexts/FollowedTeamsContext';
import type { Team } from '@/data/mockData';
import TeamPicker from '@/components/TeamPicker';
import TeamIntelligence from '@/components/TeamIntelligence';
import Disclaimer from '@/components/Disclaimer';

/** Normal AI Insights: "What does SportMind currently think about the team(s) I follow?"
 * The selected team always comes from the user's own followed-team list (max 3, managed
 * entirely by FollowedTeamsContext) — never from a route param, never a team the user
 * merely happens to be viewing. Match Analysis's per-team CTA opens a separate, purely
 * contextual screen (app/team-insights/[teamId].tsx) that reuses the same
 * TeamIntelligence content/data derivation but never touches this screen's selection or
 * FollowedTeamsContext — the two are intentionally different shells around shared
 * content, not one page trying to serve both purposes. */
export default function InsightsScreen() {
  const { t } = useTranslation();
  const { teams, matches, changeEvents, analysisChanges } = useAppData();
  const { teamIds, toggle: toggleTeam, canFollowMore } = useFollowedTeams();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const followedTeams = teamIds.map((id) => teams[id]).filter(Boolean);

  // First followed team selected by default; if the selection becomes invalid (removed,
  // or nothing followed yet), fall back to the new first team rather than showing a dead
  // selection — never assumes exactly 3 teams, works for any follow limit.
  useEffect(() => {
    if (followedTeams.length === 0) {
      if (selectedTeamId !== null) setSelectedTeamId(null);
      return;
    }
    if (!selectedTeamId || !followedTeams.some((tm) => tm.id === selectedTeamId)) {
      setSelectedTeamId(followedTeams[0].id);
    }
  }, [followedTeams, selectedTeamId]);

  const selectedTeam: Team | null = followedTeams.find((tm) => tm.id === selectedTeamId) ?? null;

  // Team-level, not match-level: this is the team's own next scheduled fixture, used only
  // as (a) the source for squad-status/lineup facts that genuinely are match-scoped in the
  // data model, and (b) a small contextual link to the existing Match Analysis screen —
  // never as the primary subject of this screen anymore.
  const nextMatch = useMemo(() => {
    if (!selectedTeam) return null;
    return matches.find((m) => m.home.id === selectedTeam.id || m.away.id === selectedTeam.id) ?? null;
  }, [matches, selectedTeam]);

  const matchAnalysisChanges = useMemo(() => (nextMatch ? analysisChanges.filter((e) => e.matchId === nextMatch.id) : []), [analysisChanges, nextMatch]);

  // FOLLOWED TEAMS ONLY — this used to sort every loaded match's changes with followed
  // ones first, but still fell through to the global feed underneath, which made this
  // section a near-duplicate of Home's own "Recent changes" (same data, same cards) and
  // contradicted this screen's own stated purpose ("SportMind's current view of YOUR
  // team"). A change on a match the user has no connection to belongs on Home/Explore,
  // not here; an empty result now means honestly "nothing for your teams yet," including
  // when no team is followed at all, rather than quietly backfilling with unrelated matches.
  const followedMatchIds = useMemo(() => new Set(matches.filter((m) => teamIds.includes(m.home.id) || teamIds.includes(m.away.id)).map((m) => m.id)), [matches, teamIds]);
  const recentChanges = useMemo(() => {
    return changeEvents.filter((e) => followedMatchIds.has(e.matchId)).slice(0, 5);
  }, [changeEvents, followedMatchIds]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('insights.title')}</Text>
        <Text style={styles.subtitle}>{t('insights.subtitle')}</Text>

        <Text style={styles.kicker}>{t('insights.teamsKicker')}</Text>
        {followedTeams.length === 0 ? (
          <>
            <Text style={styles.emptyText}>{t('insights.followingEmptyBody', { max: MAX_FOLLOWED_TEAMS })}</Text>
            <Pressable style={styles.addButton} onPress={() => setShowPicker(true)}>
              <PlusIcon size={13} weight="bold" color={colors.primaryLink} />
              <Text style={styles.addButtonText}>{t('insights.addTeamShort')}</Text>
            </Pressable>
          </>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {followedTeams.map((team) => {
              const selected = team.id === selectedTeamId;
              return (
                <Pressable
                  key={team.id}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setSelectedTeamId(team.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={selected ? t('insights.chipSelectedLabel', { team: team.name }) : team.name}
                >
                  {selected && <CheckIcon size={12} weight="bold" color={colors.primaryTint} />}
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                    {team.name}
                  </Text>
                  <Pressable
                    hitSlop={8}
                    onPress={() => toggleTeam(team.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('insights.chipRemoveLabel', { team: team.name })}
                  >
                    <XIcon size={13} weight="bold" color={selected ? colors.primaryTint : colors.textFainter} />
                  </Pressable>
                </Pressable>
              );
            })}
            {canFollowMore && (
              <Pressable
                style={styles.addChip}
                onPress={() => setShowPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={t('insights.addTeamShort')}
              >
                <PlusIcon size={14} weight="bold" color={colors.primaryLink} />
              </Pressable>
            )}
          </ScrollView>
        )}

        <TeamPicker
          visible={showPicker}
          onClose={() => setShowPicker(false)}
          teams={teams}
          matches={matches}
          excludeIds={teamIds}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          title={t('insights.addTeamShort')}
          onSelect={(teamId) => {
            toggleTeam(teamId);
            setSelectedTeamId(teamId);
            setShowPicker(false);
            setPickerSearch('');
          }}
        />

        {selectedTeam && (
          <View style={styles.contentWrap}>
            <TeamIntelligence team={selectedTeam} nextMatch={nextMatch} analysisChanges={matchAnalysisChanges} />
          </View>
        )}

        <Text style={styles.kicker}>{t('insights.recentChangesKicker')}</Text>
        {recentChanges.length === 0 ? (
          <Text style={styles.emptyText}>{t('insights.recentChangesEmpty')}</Text>
        ) : (
          <View style={{ gap: 8, marginBottom: 16 }}>
            {recentChanges.map((event) => {
              const match = matches.find((m) => m.id === event.matchId);
              if (!match) return null;
              const delta = event.to - event.from;
              return (
                <Pressable key={event.id} style={styles.changeRow} onPress={() => router.push(`/match/${match.id}?tab=change`)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.changeMatchup} numberOfLines={1}>
                      {match.home.name} <Text style={styles.changeVs}>{t('common.vs')}</Text> {match.away.name}
                    </Text>
                    <Text style={styles.changeDescription}>{t(`changeEvents.${event.key}`)}</Text>
                  </View>
                  <View style={[styles.deltaChip, { backgroundColor: delta >= 0 ? colors.successMuted : colors.warningMuted }]}>
                    <Text style={[styles.deltaChipText, { color: delta >= 0 ? colors.successText : colors.warningText }]}>
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 120, paddingTop: spacing.sm },
  title: { fontFamily: fonts.headline, fontSize: 26, letterSpacing: -0.6, color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textFaint, marginBottom: 16 },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textFaint, marginTop: 20, marginBottom: 6 },
  emptyText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint },
  chipRow: { gap: 8, paddingVertical: 2, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 180,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary, flexShrink: 1 },
  chipTextSelected: { color: colors.primaryTint },
  addChip: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderHover, alignItems: 'center', justifyContent: 'center' },
  addButton: { marginTop: 10, minHeight: 44, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderHover, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  addButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primaryLink },
  contentWrap: { marginTop: 18, marginBottom: 24 },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  changeMatchup: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary, marginBottom: 3 },
  changeVs: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFainter },
  changeDescription: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  deltaChip: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  deltaChipText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
});
