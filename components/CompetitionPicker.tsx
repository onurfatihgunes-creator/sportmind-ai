import { useMemo } from 'react';
import { Modal, Pressable, SafeAreaView, SectionList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, CheckIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { singleColumnStyle, useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { getCompetitionInfo } from '@/data/competitions';
import SearchBar from './SearchBar';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (competition: string) => void;
  competitions: string[];
  selected: string;
  search: string;
  onSearchChange: (value: string) => void;
};

type Row = { key: string; label: string; subtitle?: string };
type Section = { title: string; data: Row[] };

/**
 * Scalable competition selector — replaces the horizontal SegmentedControl pill row,
 * which was only ever appropriate for a handful of competitions (see the IA plan). Built
 * to already work correctly whether there are 8 competitions (today) or 40+ (once Phase 3
 * data expansion lands) without needing another redesign: search-first, region-grouped
 * only when grouping would actually help (a single region collapses to a flat list rather
 * than showing one redundant header), and backed by SectionList so it stays cheap at any
 * size.
 */
export default function CompetitionPicker({ visible, onClose, onSelect, competitions, selected, search, onSearchChange }: Props) {
  const layout = useAdaptiveLayout();
  const { t } = useTranslation();

  const sections = useMemo<Section[]>(() => {
    const query = search.trim().toLowerCase();
    const matchingNames = query ? competitions.filter((c) => c.toLowerCase().includes(query)) : competitions;

    const rows: Row[] = matchingNames.map((name) => {
      const info = getCompetitionInfo(name);
      return { key: name, label: name, subtitle: info?.country };
    });

    const regions = new Map<string, Row[]>();
    for (const name of matchingNames) {
      const info = getCompetitionInfo(name);
      const region = info?.region ?? t('explore.otherRegion');
      const row = rows.find((r) => r.key === name)!;
      if (!regions.has(region)) regions.set(region, []);
      regions.get(region)!.push(row);
    }
    for (const list of regions.values()) list.sort((a, b) => a.label.localeCompare(b.label));

    const allRow: Row = { key: 'all', label: t('explore.allLeagues') };
    const showAllRow = !query || allRow.label.toLowerCase().includes(query);

    // A single region (the common case today, with only Europe + North America present)
    // renders as one flat list — a lone section header would be redundant, not helpful.
    if (regions.size <= 1) {
      const flat = [...regions.values()].flat();
      return [{ title: '', data: showAllRow ? [allRow, ...flat] : flat }];
    }

    const sortedRegions = [...regions.entries()].sort(([a], [b]) => a.localeCompare(b));
    const sectionsList: Section[] = sortedRegions.map(([region, data]) => ({ title: region, data }));
    if (showAllRow) sectionsList.unshift({ title: '', data: [allRow] });
    return sectionsList;
  }, [competitions, search, t]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={onClose} hitSlop={12} accessibilityLabel={t('common.close')} accessibilityRole="button">
            <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('explore.competitionPickerTitle')}</Text>
        </View>

        <SearchBar
          value={search}
          onChangeText={onSearchChange}
          placeholder={t('explore.searchCompetitionsPlaceholder')}
          autoFocus
          height={40}
          fontSize={13}
          style={[styles.searchBar, singleColumnStyle(layout)]}
        />

        <SectionList
          sections={sections}
          keyExtractor={(row) => row.key}
          contentContainerStyle={styles.listContent}
          style={singleColumnStyle(layout)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={styles.emptyText}>{t('explore.noCompetitionsMatch')}</Text>}
          renderSectionHeader={({ section }) => (section.title ? <Text style={styles.sectionHeader}>{section.title}</Text> : null)}
          renderItem={({ item }) => {
            const isSelected = item.key === selected;
            return (
              <Pressable
                style={styles.row}
                onPress={() => onSelect(item.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={item.subtitle ? `${item.label}, ${item.subtitle}` : item.label}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  {item.subtitle && <Text style={styles.rowSubtitle}>{item.subtitle}</Text>}
                </View>
                {isSelected && <CheckIcon size={16} weight="bold" color={colors.primary} />}
              </Pressable>
            );
          }}
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  rowSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 1 },
});
