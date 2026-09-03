import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BookmarkSimpleIcon, MagnifyingGlassIcon, SortDescendingIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import { useWatchlist } from '@/contexts/WatchlistContext';
import SegmentedControl from '@/components/SegmentedControl';
import TeamBadgePair from '@/components/TeamBadgePair';

function dayBucket(kickoff: string): 'today' | 'tomorrow' | 'later' {
  if (kickoff.startsWith('Today')) return 'today';
  if (kickoff.startsWith('Tomorrow')) return 'tomorrow';
  return 'later';
}

export default function ExploreScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ league?: string }>();
  const { matches } = useAppData();
  const { isWatched, toggle: toggleWatch } = useWatchlist();
  const [search, setSearch] = useState('');
  const [selectedLeague, setSelectedLeague] = useState(params.league ?? 'all');
  const [sortAsc, setSortAsc] = useState(false);

  // Home links here with a `league` param (e.g. from its league chips) — re-apply it
  // whenever it changes, since expo-router reuses this screen's instance across tab visits.
  useEffect(() => {
    if (params.league) setSelectedLeague(params.league);
  }, [params.league]);

  const competitions = useMemo(() => Array.from(new Set(matches.map((m) => m.competition))), [matches]);
  const leagueOptions = useMemo(
    () => [{ key: 'all', label: t('explore.allLeagues') }, ...competitions.map((c) => ({ key: c, label: c }))],
    [competitions, t],
  );

  const filteredMatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return matches
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
  }, [matches, search, selectedLeague, sortAsc]);

  const grouped = useMemo(() => {
    const buckets: Record<'today' | 'tomorrow' | 'later', typeof filteredMatches> = { today: [], tomorrow: [], later: [] };
    filteredMatches.forEach((m) => buckets[dayBucket(m.kickoff)].push(m));
    return buckets;
  }, [filteredMatches]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('explore.title')}</Text>

        <View style={styles.searchBar}>
          <MagnifyingGlassIcon size={16} color={colors.textFainter} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('explore.searchPlaceholder')}
            placeholderTextColor={colors.textFainter}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          <SegmentedControl options={leagueOptions} value={selectedLeague} onChange={setSelectedLeague} height={34} fontSize={11} />
        </ScrollView>

        {filteredMatches.length === 0 && <Text style={styles.emptyText}>{t('explore.noResults')}</Text>}

        {(['today', 'tomorrow', 'later'] as const).map((bucket) =>
          grouped[bucket].length === 0 ? null : (
            <View key={bucket}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.kicker}>{t(`explore.${bucket}`)}</Text>
                {bucket === 'today' && (
                  <Pressable style={styles.sortToggle} onPress={() => setSortAsc((prev) => !prev)}>
                    <SortDescendingIcon size={13} weight="bold" color={colors.primary} />
                    <Text style={styles.sortToggleText}>{sortAsc ? t('home.sortLowToHigh') : t('home.sortHighToLow')}</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.matchList}>
                {grouped[bucket].map((m, index) => {
                  const favourite = favouredOutcome(m);
                  const watched = isWatched(m.id);
                  return (
                    <Pressable
                      key={m.id}
                      style={[styles.matchRow, bucket === 'today' && index === 0 && styles.matchRowFeatured]}
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
          ),
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 120, paddingTop: spacing.sm },
  title: { fontFamily: fonts.headline, fontSize: 26, letterSpacing: -0.6, color: colors.textPrimary, marginBottom: 14 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary, padding: 0 },
  filterRow: { marginTop: 14, marginBottom: 16 },
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
