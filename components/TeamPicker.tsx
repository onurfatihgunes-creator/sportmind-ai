import { useMemo } from 'react';
import { Modal, Pressable, SafeAreaView, SectionList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import type { Match, Team } from '@/data/mockData';
import { getCompetitionInfo } from '@/data/competitions';
import SearchBar from './SearchBar';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (teamId: string) => void;
  teams: Record<string, Team>;
  matches: Match[];
  excludeIds: string[];
  search: string;
  onSearchChange: (value: string) => void;
  title: string;
};

type Row = { team: Team; subtitle: string };
type Section = { title: string; data: Row[] };

/** A team's own competition isn't stored on the Team row itself (see the IA plan's Data
 * Requirements) — derived here from whichever competition appears most often across that
 * team's own matches, computed once per candidate list build rather than per row render. */
function deriveTeamSubtitle(team: Team, matches: Match[]): string {
  const counts = new Map<string, number>();
  for (const m of matches) {
    if (m.home.id !== team.id && m.away.id !== team.id) continue;
    counts.set(m.competition, (counts.get(m.competition) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [competition, count] of counts) {
    if (count > bestCount) {
      best = competition;
      bestCount = count;
    }
  }
  if (!best) return '';
  const info = getCompetitionInfo(best);
  return info ? `${info.country} · ${best}` : best;
}

/**
 * Scalable team search — built to stay usable from today's real team count through the
 * ~750-800 teams the coverage audit found achievable, without needing another rewrite:
 * search-first (nothing renders until there's real data to show), sport-sectioned (never
 * mixes football/basketball in one undifferentiated list — see the multi-sport fixes
 * earlier in this project), each row disambiguated by country+competition, and backed by
 * SectionList so only visible rows are ever mounted.
 */
export default function TeamPicker({ visible, onClose, onSelect, teams, matches, excludeIds, search, onSearchChange, title }: Props) {
  const { t } = useTranslation();

  const sections = useMemo<Section[]>(() => {
    const query = search.trim().toLowerCase();
    const candidates = Object.values(teams).filter((tm) => !excludeIds.includes(tm.id));
    const matching = query ? candidates.filter((tm) => tm.name.toLowerCase().includes(query)) : candidates;

    const bySport: Record<'football' | 'basketball', Row[]> = { football: [], basketball: [] };
    for (const team of matching) {
      bySport[team.sport].push({ team, subtitle: deriveTeamSubtitle(team, matches) });
    }
    (['football', 'basketball'] as const).forEach((sport) => bySport[sport].sort((a, b) => a.team.name.localeCompare(b.team.name)));

    return (['football', 'basketball'] as const)
      .filter((sport) => bySport[sport].length > 0)
      .map((sport) => ({ title: t(`home.${sport}`), data: bySport[sport] }));
  }, [teams, matches, excludeIds, search, t]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={onClose} hitSlop={12} accessibilityLabel={t('common.close')} accessibilityRole="button">
            <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>

        <SearchBar
          value={search}
          onChangeText={onSearchChange}
          placeholder={t('insights.searchTeamsPlaceholder')}
          autoFocus
          height={40}
          fontSize={13}
          style={styles.searchBar}
        />

        <SectionList
          sections={sections}
          keyExtractor={(row) => row.team.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.emptyText}>{t('insights.noTeamsMatch')}</Text>}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => onSelect(item.team.id)}
              accessibilityRole="button"
              accessibilityLabel={item.subtitle ? `${item.team.name}, ${item.subtitle}` : item.team.name}
            >
              <View style={[styles.badge, { backgroundColor: item.team.bg }]}>
                <Text style={[styles.badgeText, { color: item.team.fg }]}>{item.team.code}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.teamName}>{item.team.name}</Text>
                {item.subtitle.length > 0 && <Text style={styles.teamSubtitle}>{item.subtitle}</Text>}
              </View>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  searchBar: { marginHorizontal: spacing.screenX, marginTop: 6, marginBottom: 10 },
  listContent: { paddingHorizontal: spacing.screenX, paddingBottom: 40 },
  emptyText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint, marginTop: 12 },
  sectionHeader: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textFaint,
    backgroundColor: colors.background,
    paddingTop: 12,
    paddingBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, minHeight: 48 },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 10 },
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  teamSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 1 },
});
