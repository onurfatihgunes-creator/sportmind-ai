import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome, teams } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import { useWatchlist } from '@/contexts/WatchlistContext';
import TeamCrest from '@/components/TeamCrest';
import ConfidenceRing from '@/components/ConfidenceRing';

const trending = [teams.arsenal, teams.liverpool, teams.barcelona];

export default function ExploreScreen() {
  const { t } = useTranslation();
  const { matches } = useAppData();
  const { isWatched, toggle: toggleWatch } = useWatchlist();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  const competitions = useMemo(() => Array.from(new Set(matches.map((m) => m.competition))), [matches]);

  const filteredMatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return matches
      .filter((m) => {
        if (selectedLeague && m.competition !== selectedLeague) return false;
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

  const toggleMatch = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected([]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, selectMode && { paddingBottom: 140 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('explore.title')}</Text>
          <Pressable onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}>
            <Text style={styles.selectToggle}>{selectMode ? t('common.cancel') : t('explore.selectMatches')}</Text>
          </Pressable>
        </View>

        <View style={styles.searchBar}>
          <Feather name="search" size={14} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('explore.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8 }}>
          <Pressable
            style={[styles.filterChip, selectedLeague === null && styles.filterChipActive]}
            onPress={() => setSelectedLeague(null)}
          >
            <Text style={selectedLeague === null ? styles.filterChipTextActive : styles.filterChipText}>
              {t('explore.allLeagues')}
            </Text>
          </Pressable>
          {competitions.map((league) => (
            <Pressable
              key={league}
              style={[styles.filterChip, selectedLeague === league && styles.filterChipActive]}
              onPress={() => setSelectedLeague(league)}
            >
              <Text style={selectedLeague === league ? styles.filterChipTextActive : styles.filterChipText}>
                {league}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{t('explore.matches')}</Text>
          <Pressable style={styles.sortToggle} onPress={() => setSortAsc((prev) => !prev)}>
            <Feather name={sortAsc ? 'arrow-up' : 'arrow-down'} size={11} color={colors.primaryLight} />
            <Text style={styles.sortToggleText}>{sortAsc ? t('home.sortLowToHigh') : t('home.sortHighToLow')}</Text>
          </Pressable>
        </View>
        {filteredMatches.length === 0 && <Text style={styles.emptyText}>{t('explore.noResults')}</Text>}
        {filteredMatches.map((m) => {
          const isSelected = selected.includes(m.id);
          return (
            <Pressable
              key={m.id}
              style={styles.matchRow}
              onPress={() => (selectMode ? toggleMatch(m.id) : router.push(`/match/${m.id}`))}
            >
              {selectMode && (
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Feather name="check" size={11} color="#fff" />}
                </View>
              )}
              <View style={styles.matchCrests}>
                <TeamCrest team={m.home} size={28} />
                <TeamCrest team={m.away} size={28} overlap />
              </View>
              <View style={styles.matchInfo}>
                <Text style={styles.matchTitle}>
                  {m.home.name} {t('common.vs')} {m.away.name}
                </Text>
                <Text style={styles.matchSubtitle}>
                  {m.kickoff} · {m.competition}
                </Text>
              </View>
              {!selectMode && (
                <Pressable hitSlop={10} onPress={() => toggleWatch(m.id)}>
                  <Feather name="bookmark" size={16} color={isWatched(m.id) ? colors.primaryLight : colors.textFaint} />
                </Pressable>
              )}
              <ConfidenceRing value={favouredOutcome(m).probability} size={30} strokeWidth={3.5} />
            </Pressable>
          );
        })}

        <Text style={styles.sectionLabel}>{t('explore.trending')}</Text>
        <View style={styles.trendingRow}>
          {trending.map((team) => (
            <View key={team.id} style={styles.trendingItem}>
              <TeamCrest team={team} size={40} />
              <Text style={styles.trendingName}>{team.name}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {selectMode && selected.length > 0 && (
        <View style={styles.selectionBar}>
          <Pressable
            style={styles.selectionCta}
            onPress={() => {
              router.push({ pathname: '/batch-analysis', params: { ids: selected.join(',') } });
              exitSelectMode();
            }}
          >
            <Text style={styles.selectionCtaText}>{t('explore.analyseMatches', { count: selected.length })}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
  title: { fontFamily: fonts.headline, fontSize: 22, color: colors.textPrimary },
  selectToggle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primaryLight },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.textPrimary, padding: 0 },
  filterRow: { marginBottom: spacing.xl },
  emptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.surface },
  filterChipActive: { backgroundColor: colors.primaryMuted },
  filterChipText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  filterChipTextActive: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.primaryLight },
  sectionLabel: {
    fontFamily: fonts.headline,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sortToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.md },
  sortToggleText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLight },
  matchRow: {
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
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  matchCrests: { flexDirection: 'row', alignItems: 'center' },
  matchInfo: { flex: 1 },
  matchTitle: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textPrimary },
  matchSubtitle: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textMuted, marginTop: 2 },
  trendingRow: { flexDirection: 'row', gap: 14, marginBottom: spacing.xl },
  trendingItem: { alignItems: 'center', width: 64 },
  trendingName: { fontFamily: fonts.body, fontSize: 10, color: colors.textSecondary, marginTop: 6, textAlign: 'center' },
  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 84,
    paddingHorizontal: spacing.xl,
  },
  selectionCta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  selectionCtaText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: '#fff' },
});
