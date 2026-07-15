import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import TeamCrest from '@/components/TeamCrest';
import Disclaimer from '@/components/Disclaimer';

const formColor = { W: colors.success, D: colors.warning, L: colors.danger } as const;

export default function TeamProfileScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { teams, matches } = useAppData();
  const team = (id && teams[id]) || Object.values(teams)[0];
  const upcoming = matches.filter((m) => m.home.id === team.id || m.away.id === team.id);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('teamProfile.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <TeamCrest team={team} size={52} />
          <Text style={styles.teamName}>{team.name}</Text>
        </View>

        <Text style={styles.sectionLabel}>{t('teamProfile.recentForm')}</Text>
        <View style={styles.formRow}>
          {team.form.map((result, index) => (
            <View key={index} style={[styles.formPill, { backgroundColor: `${formColor[result]}22` }]}>
              <Text style={[styles.formPillText, { color: formColor[result] }]}>{result}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>{t('teamProfile.upcomingMatches')}</Text>
        {upcoming.map((m) => {
          const opponent = m.home.id === team.id ? m.away : m.home;
          const favourite = favouredOutcome(m);
          const favoursThisTeam = favourite.team?.id === team.id;
          return (
            <Pressable key={m.id} style={styles.matchRow} onPress={() => router.push(`/match/${m.id}`)}>
              <TeamCrest team={opponent} size={28} />
              <View style={styles.matchInfo}>
                <Text style={styles.matchTitle}>{t('teamProfile.vsPrefix', { team: opponent.name })}</Text>
                <Text style={styles.matchSubtitle}>{m.kickoff}</Text>
              </View>
              <Text style={[styles.matchTag, favoursThisTeam ? styles.matchTagPositive : styles.matchTagNeutral]}>
                {favourite.team ? t('matchCard.favoured', { team: favourite.team.name }) : t('matchCard.drawLikely')}
              </Text>
            </Pressable>
          );
        })}
        {upcoming.length === 0 && <Text style={styles.emptyText}>{t('teamProfile.noUpcoming')}</Text>}

        <Disclaimer style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  heroWrap: { alignItems: 'center', marginBottom: spacing.xl },
  teamName: { fontFamily: fonts.headline, fontSize: 17, color: colors.textPrimary, marginTop: spacing.sm },
  sectionLabel: {
    fontFamily: fonts.headline,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  formRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.xl },
  formPill: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  formPillText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: spacing.sm,
  },
  matchInfo: { flex: 1 },
  matchTitle: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textPrimary },
  matchSubtitle: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textMuted, marginTop: 2 },
  matchTag: { fontFamily: fonts.bodyMedium, fontSize: 9.5 },
  matchTagPositive: { color: colors.successText },
  matchTagNeutral: { color: colors.textMuted },
  emptyText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted },
});
