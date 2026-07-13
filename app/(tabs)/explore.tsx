import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { leagues, teams } from '@/data/mockData';
import TeamCrest from '@/components/TeamCrest';

const trending = [teams.arsenal, teams.liverpool, teams.barcelona];

export default function ExploreScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Explore</Text>

        <View style={styles.searchBar}>
          <Feather name="search" size={14} color={colors.textMuted} />
          <Text style={styles.searchPlaceholder}>Try "weekend matches"</Text>
        </View>

        <View style={styles.filterRow}>
          <View style={[styles.filterChip, styles.filterChipActive]}>
            <Text style={styles.filterChipTextActive}>League</Text>
          </View>
          <View style={styles.filterChip}>
            <Text style={styles.filterChipText}>Country</Text>
          </View>
          <View style={styles.filterChip}>
            <Text style={styles.filterChipText}>Date</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Trending</Text>
        <View style={styles.trendingRow}>
          {trending.map((t) => (
            <View key={t.id} style={styles.trendingItem}>
              <TeamCrest team={t} size={40} />
              <Text style={styles.trendingName}>{t.name}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Browse by league</Text>
        <View style={styles.leagueGrid}>
          {leagues.map((league) => (
            <View key={league} style={styles.leagueCard}>
              <Feather
                name={league === 'Champions League' ? 'award' : 'circle'}
                size={16}
                color={league === 'Champions League' ? colors.warningText : colors.primaryLight}
              />
              <Text style={styles.leagueName}>{league}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  title: { fontFamily: fonts.headline, fontSize: 22, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.lg },
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
  searchPlaceholder: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.xl },
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
  trendingRow: { flexDirection: 'row', gap: 14, marginBottom: spacing.xl },
  trendingItem: { alignItems: 'center', width: 64 },
  trendingName: { fontFamily: fonts.body, fontSize: 10, color: colors.textSecondary, marginTop: 6, textAlign: 'center' },
  leagueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  leagueCard: {
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 13,
  },
  leagueName: { fontFamily: fonts.body, fontSize: 11.5, color: '#E5E7EB', flexShrink: 1 },
});
