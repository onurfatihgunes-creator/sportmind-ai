import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BasketballIcon, BookmarkSimpleIcon, CaretDownIcon, SoccerBallIcon, SortDescendingIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome, type Match, type Sport } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import { useWatchlist } from '@/contexts/WatchlistContext';
import SegmentedControl from '@/components/SegmentedControl';
import SearchBar from '@/components/SearchBar';
import CompetitionPicker from '@/components/CompetitionPicker';
import TeamBadgePair from '@/components/TeamBadgePair';

type DayGroup = { key: string; label: string; matches: Match[] };

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calendar-accurate day grouping — replaces the old string-prefix check on the
 * pre-formatted `kickoff` display string (which only ever recognised "Today"/"Tomorrow"
 * and dumped everything else into one undifferentiated "later" bucket). Using the real
 * `kickoffAt` ISO timestamp lets every day in the active window get its own group, keyed
 * by calendar date (so two different Wednesdays a week apart never collapse into one
 * bucket) and labelled with a real weekday name beyond tomorrow. Falls back to the old
 * heuristic only when `kickoffAt` is missing (mock data has no real dates).
 */
function dayGroupFor(match: Match, t: (key: string) => string): { key: string; label: string } {
  if (!match.kickoffAt) {
    if (match.kickoff.startsWith('Today')) return { key: '0000-today', label: t('explore.today') };
    if (match.kickoff.startsWith('Tomorrow')) return { key: '0001-tomorrow', label: t('explore.tomorrow') };
    return { key: '9999-later', label: t('explore.later') };
  }
  const kickoffDate = new Date(match.kickoffAt);
  const today = startOfDay(new Date());
  const target = startOfDay(kickoffDate);
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const isoKey = target.toISOString().slice(0, 10);
  if (dayDiff === 0) return { key: isoKey, label: t('explore.today') };
  if (dayDiff === 1) return { key: isoKey, label: t('explore.tomorrow') };
  return { key: isoKey, label: kickoffDate.toLocaleDateString(undefined, { weekday: 'long' }) };
}

export default function ExploreScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ league?: string }>();
  const { matches } = useAppData();
  const { isWatched, toggle: toggleWatch } = useWatchlist();
  const [search, setSearch] = useState('');
  const [selectedSport, setSelectedSport] = useState<Sport>('football');
  const [selectedLeague, setSelectedLeague] = useState(params.league ?? 'all');
  const [sortAsc, setSortAsc] = useState(false);
  const [competitionPickerOpen, setCompetitionPickerOpen] = useState(false);
  const [competitionSearch, setCompetitionSearch] = useState('');

  // Home links here with a `league` param (e.g. from its league chips) — re-apply it
  // whenever it changes, since expo-router reuses this screen's instance across tab visits.
  useEffect(() => {
    if (params.league) setSelectedLeague(params.league);
  }, [params.league]);

  // Explore is the full discovery surface (not just Home's 6-match curation), so it needs
  // the same sport boundary Home enforces: a league/competition list built across both
  // sports would mix e.g. "NBA" into a row of football leagues. Switching sport resets the
  // league filter, since a league selected under one sport won't exist under the other.
  const sportMatches = useMemo(() => matches.filter((m) => m.sport === selectedSport), [matches, selectedSport]);

  const competitions = useMemo(() => Array.from(new Set(sportMatches.map((m) => m.competition))), [sportMatches]);

  const filteredMatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sportMatches
      .filter((m) => {
        if (selectedLeague !== 'all' && m.competition !== selectedLeague) return false;
        if (!query) return true;
        return (
          m.home.name.toLowerCase().includes(query) ||
          m.away.name.toLowerCase().includes(query) ||
          m.competition.toLowerCase().includes(query)
        );
      })
      .sort((a, b) =>
        sortAsc
          ? favouredOutcome(a).probability - favouredOutcome(b).probability
          : favouredOutcome(b).probability - favouredOutcome(a).probability,
      );
  }, [sportMatches, search, selectedLeague, sortAsc]);

  const groupedByDay = useMemo(() => {
    const groups = new Map<string, DayGroup>();
    for (const m of filteredMatches) {
      const { key, label } = dayGroupFor(m, t);
      if (!groups.has(key)) groups.set(key, { key, label, matches: [] });
      groups.get(key)!.matches.push(m);
    }
    return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredMatches, t]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('explore.title')}</Text>

        <SearchBar value={search} onChangeText={setSearch} placeholder={t('explore.searchPlaceholder')} />

        <SegmentedControl
          style={styles.sportSegment}
          options={[
            { key: 'football', label: t('home.football'), icon: <SoccerBallIcon size={14} weight="bold" color={colors.textSecondary} /> },
            { key: 'basketball', label: t('home.basketball'), icon: <BasketballIcon size={14} weight="bold" color={colors.textSecondary} /> },
          ]}
          value={selectedSport}
          onChange={(key) => {
            setSelectedSport(key as Sport);
            setSelectedLeague('all');
          }}
        />

        <Pressable
          style={styles.competitionTrigger}
          onPress={() => setCompetitionPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('explore.competitionPickerTitle')}
        >
          <Text
            style={[styles.competitionTriggerText, selectedLeague === 'all' && styles.competitionTriggerPlaceholder]}
            numberOfLines={1}
          >
            {selectedLeague === 'all' ? t('explore.selectCompetitionPlaceholder') : selectedLeague}
          </Text>
          <CaretDownIcon size={13} weight="bold" color={colors.textSecondary} />
        </Pressable>

        <CompetitionPicker
          visible={competitionPickerOpen}
          onClose={() => setCompetitionPickerOpen(false)}
          competitions={competitions}
          selected={selectedLeague}
          search={competitionSearch}
          onSearchChange={setCompetitionSearch}
          onSelect={(competition) => {
            setSelectedLeague(competition);
            setCompetitionPickerOpen(false);
            setCompetitionSearch('');
          }}
        />

        {filteredMatches.length === 0 && <Text style={styles.emptyText}>{t('explore.noResults')}</Text>}

        {groupedByDay.map((group) => {
          const isToday = group.label === t('explore.today');
          return (
            <View key={group.key}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.kicker}>{group.label}</Text>
                {isToday && (
                  <Pressable style={styles.sortToggle} onPress={() => setSortAsc((prev) => !prev)}>
                    <SortDescendingIcon size={13} weight="bold" color={colors.primary} />
                    <Text style={styles.sortToggleText}>{sortAsc ? t('home.sortLowToHigh') : t('home.sortHighToLow')}</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.matchList}>
                {group.matches.map((m, index) => {
                  const favourite = favouredOutcome(m);
                  const watched = isWatched(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      style={[styles.matchRow, isToday && index === 0 && styles.matchRowFeatured]}
                      onPress={() => router.push(`/match/${m.id}`)}
                    >
                      <TeamBadgePair home={m.home} away={m.away} />
                      <View style={styles.matchInfo}>
                        <Text style={styles.matchTitle}>
                          {m.home.name} — {m.away.name}
                        </Text>
                        <Text style={styles.matchSubtitle}>
                          {m.kickoff.replace(/^(Today|Tomorrow),\s*/, '')} · {m.competition}
                        </Text>
                      </View>
                      <View style={[styles.pctChip, { backgroundColor: colors.divider }, favourite.probability >= 55 && { backgroundColor: colors.primaryTintStrong }]}>
                        <Text style={[styles.pctChipText, { color: colors.textSecondaryAlt }, favourite.probability >= 55 && { color: colors.primaryText }]}>
                          {favourite.probability}%
                        </Text>
                      </View>
                      <Pressable
                        hitSlop={10}
                        style={styles.favButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          toggleWatch(m.id);
                        }}
                      >
                        <BookmarkSimpleIcon size={17} weight={watched ? 'fill' : 'regular'} color={watched ? colors.primary : colors.textFainter} />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 120, paddingTop: spacing.sm },
  title: { fontFamily: fonts.headline, fontSize: 26, letterSpacing: -0.6, color: colors.textPrimary, marginBottom: 14 },
  sportSegment: { marginTop: 14 },
  competitionTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 16,
  },
  competitionTriggerText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary, marginRight: 8 },
  competitionTriggerPlaceholder: { color: colors.textFaint },
  emptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginBottom: spacing.md },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 9 },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textFaint },
  sortToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.surface },
  sortToggleText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.textSecondaryAlt },
  matchList: { gap: 8, marginBottom: 12 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
  },
  matchRowFeatured: { backgroundColor: colors.surfaceSelected, borderColor: colors.borderAccent },
  matchInfo: { flex: 1, minWidth: 0 },
  matchTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, marginBottom: 3 },
  matchSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  pctChip: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  pctChipText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  favButton: { width: 38, height: 38, marginVertical: -8, marginRight: -8, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
});
