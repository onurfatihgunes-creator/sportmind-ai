import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BellIcon, ChartPolarIcon, MagnifyingGlassIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useAppData } from '@/contexts/DataContext';
import { useFollowedTeams, MAX_FOLLOWED_TEAMS } from '@/contexts/FollowedTeamsContext';

export default function InsightsScreen() {
  const { t } = useTranslation();
  const { teams, matches, changeEvents } = useAppData();
  const { teamIds, toggle: toggleTeam, canFollowMore } = useFollowedTeams();
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSearchFocused, setPickerSearchFocused] = useState(false);

  const followedTeams = teamIds.map((id) => teams[id]).filter(Boolean);

  // Grouped by sport rather than one flat list — 244 real teams across football and
  // basketball pooled together (89 of them basketball) made an already-long list actively
  // misleading, not just long: a football-following feature silently offering NBA teams
  // in the same unlabelled list. Search narrows the list; the sport headers keep what's
  // left honestly labelled instead of just shorter.
  const availableTeamsBySport = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    const notFollowed = Object.values(teams).filter((tm) => !teamIds.includes(tm.id));
    const matching = query ? notFollowed.filter((tm) => tm.name.toLowerCase().includes(query)) : notFollowed;
    const football = matching.filter((tm) => tm.sport === 'football').sort((a, b) => a.name.localeCompare(b.name));
    const basketball = matching.filter((tm) => tm.sport === 'basketball').sort((a, b) => a.name.localeCompare(b.name));
    return { football, basketball };
  }, [teams, teamIds, pickerSearch]);

  const teamStatus = (teamId: string) => {
    const relevant = changeEvents
      .map((e) => ({ e, match: matches.find((m) => m.id === e.matchId) }))
      .filter((x) => x.match && (x.match.home.id === teamId || x.match.away.id === teamId));
    if (relevant.length === 0) return { text: t('insights.stableNoChanges'), delta: null as number | null, tone: 'neutral' as const };
    const latest = relevant[0].e;
    return { text: `${t(`changeEvents.${latest.key}`)} · ${latest.timestamp}`, delta: latest.to - latest.from, tone: latest.tone };
  };

  // A global feed (not filtered to followed teams) — Change Intelligence is a
  // product asset in its own right, not just a per-team status line.
  const recentChanges = useMemo(
    () =>
      changeEvents
        .map((e) => ({ event: e, match: matches.find((m) => m.id === e.matchId) }))
        .filter((x): x is { event: typeof changeEvents[number]; match: NonNullable<typeof x.match> } => Boolean(x.match))
        .slice(0, 5),
    [changeEvents, matches],
  );

  const compareTargets = followedTeams.slice(0, 2);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('insights.title')}</Text>

        <Text style={styles.kicker}>{t('insights.followingKicker')}</Text>
        {followedTeams.length === 0 && (
          <Text style={styles.followingEmptyText}>{t('insights.followingEmptyBody', { max: MAX_FOLLOWED_TEAMS })}</Text>
        )}
        {followedTeams.length > 0 && (
          <Text style={styles.followingCountText}>{t('insights.followingCount', { count: followedTeams.length, max: MAX_FOLLOWED_TEAMS })}</Text>
        )}

        <View style={{ marginTop: 10, gap: 8 }}>
          {followedTeams.map((team) => {
            const status = teamStatus(team.id);
            return (
              <Pressable key={team.id} style={styles.teamRow} onLongPress={() => toggleTeam(team.id)}>
                <View style={[styles.teamBadge, { backgroundColor: team.bg }]}>
                  <Text style={[styles.teamBadgeText, { color: team.fg }]}>{team.code}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teamName}>{team.name}</Text>
                  <Text style={[styles.teamStatus, status.tone === 'success' && { color: colors.successText }, status.tone === 'warning' && { color: colors.warningText }]}>
                    {status.text}
                  </Text>
                </View>
                {status.delta !== null ? (
                  <View style={[styles.deltaChip, { backgroundColor: status.delta >= 0 ? colors.successMuted : colors.warningMuted }]}>
                    <Text style={[styles.deltaChipText, { color: status.delta >= 0 ? colors.successText : colors.warningText }]}>
                      {status.delta > 0 ? '+' : ''}
                      {status.delta}
                    </Text>
                  </View>
                ) : (
                  <BellIcon size={17} color={colors.textFainter} />
                )}
                {/* Long-press also unfollows (kept for muscle memory), but that gesture has
                    zero visual affordance — this X is the discoverable way to remove a
                    followed team. */}
                <Pressable hitSlop={10} onPress={() => toggleTeam(team.id)}>
                  <XIcon size={16} color={colors.textFainter} />
                </Pressable>
              </Pressable>
            );
          })}

          {canFollowMore ? (
            <Pressable style={styles.addButton} onPress={() => setShowPicker((v) => !v)}>
              <PlusIcon size={13} weight="bold" color={colors.primaryLink} />
              <Text style={styles.addButtonText}>{t('insights.addTeamShort')}</Text>
            </Pressable>
          ) : (
            <Text style={styles.maxReachedText}>{t('insights.maxTeamsReached', { max: MAX_FOLLOWED_TEAMS })}</Text>
          )}
          {showPicker && (
            <View style={styles.pickerBox}>
              <View style={[styles.pickerSearchBar, pickerSearchFocused && styles.pickerSearchBarFocused]}>
                <MagnifyingGlassIcon size={14} color={colors.textFainter} />
                <TextInput
                  style={styles.pickerSearchInput}
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                  onFocus={() => setPickerSearchFocused(true)}
                  onBlur={() => setPickerSearchFocused(false)}
                  placeholder={t('insights.searchTeamsPlaceholder')}
                  placeholderTextColor={colors.textFainter}
                  autoFocus
                />
              </View>
              <View style={styles.pickerList}>
                {availableTeamsBySport.football.length === 0 && availableTeamsBySport.basketball.length === 0 && (
                  <Text style={styles.followingEmptyText}>{t('insights.noTeamsMatch')}</Text>
                )}
                {(['football', 'basketball'] as const).map((sport) =>
                  availableTeamsBySport[sport].length === 0 ? null : (
                    <View key={sport}>
                      <Text style={styles.pickerSportHeader}>{t(`home.${sport}`)}</Text>
                      {availableTeamsBySport[sport].map((team) => (
                        <Pressable
                          key={team.id}
                          style={styles.pickerRow}
                          onPress={() => {
                            toggleTeam(team.id);
                            setShowPicker(false);
                            setPickerSearch('');
                          }}
                        >
                          <View style={[styles.teamBadge, { width: 26, height: 26, borderRadius: 13, backgroundColor: team.bg }]}>
                            <Text style={[styles.teamBadgeText, { fontSize: 9, color: team.fg }]}>{team.code}</Text>
                          </View>
                          <Text style={styles.teamName}>{team.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ),
                )}
              </View>
            </View>
          )}
        </View>

        <Text style={styles.kicker}>{t('insights.recentChangesKicker')}</Text>
        {recentChanges.length === 0 ? (
          <Text style={styles.followingEmptyText}>{t('insights.recentChangesEmpty')}</Text>
        ) : (
          <View style={{ gap: 8, marginBottom: 16 }}>
            {recentChanges.map(({ event, match }) => {
              const delta = event.to - event.from;
              return (
                <Pressable
                  key={event.id}
                  style={styles.changeRow}
                  onPress={() => router.push(`/match/${match.id}?tab=change`)}
                >
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

        {compareTargets.length === 2 && (
          <>
            {/* Its own labelled section — Compare is unrelated to the Following list filling
                up (it just needs 2+ followed teams, independent of the 3-team cap above), but
                sitting directly under a short/empty Recent Changes made it look like a
                replacement for the vanished Add button rather than a separate feature. */}
            <Text style={styles.kicker}>{t('insights.compareKicker')}</Text>
            <Pressable
              style={styles.compareButton}
              onPress={() => router.push({ pathname: '/team-comparison', params: { a: compareTargets[0].id, b: compareTargets[1].id } })}
            >
              <ChartPolarIcon size={16} weight="bold" color={colors.primaryText} />
              <Text style={styles.compareButtonText}>
                {t('insights.compareLink', { a: compareTargets[0].name, b: compareTargets[1].name })}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 120, paddingTop: spacing.sm },
  title: { fontFamily: fonts.headline, fontSize: 26, letterSpacing: -0.6, color: colors.textPrimary, marginBottom: 16 },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textFaint, marginTop: 20, marginBottom: 6 },
  followingEmptyText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint },
  followingCountText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  teamBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  teamBadgeText: { fontFamily: fonts.bodyBold, fontSize: 10 },
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
  teamStatus: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  deltaChip: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  deltaChipText: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  addButton: { minHeight: 44, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderHover, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  addButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.primaryLink },
  maxReachedText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 12 },
  pickerBox: { marginTop: 8, gap: 8 },
  pickerSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
  },
  pickerSearchBarFocused: { borderColor: colors.primary },
  pickerSearchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textPrimary,
    padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'solid', outlineWidth: 0 } : null),
  },
  pickerSportHeader: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.textFaint, marginTop: 8, marginBottom: 4 },
  pickerList: { gap: 4 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.sm, backgroundColor: colors.surfaceSubtle },
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
  compareButton: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  compareButtonText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.primaryText },
});
