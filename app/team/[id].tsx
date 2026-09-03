import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import TeamBadgePair from '@/components/TeamBadgePair';
import Disclaimer from '@/components/Disclaimer';

const formTone = {
  W: { bg: colors.successMuted, fg: colors.successText },
  D: { bg: colors.divider, fg: colors.textSecondaryAlt },
  L: { bg: colors.dangerMuted, fg: colors.dangerText },
} as const;

export default function TeamProfileScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { teams, matches } = useAppData();
  const team = (id && teams[id]) || Object.values(teams)[0];
  const upcoming = matches.filter((m) => m.home.id === team.id || m.away.id === team.id);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('teamProfile.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <View style={[styles.crest, { backgroundColor: team.bg }]}>
            <Text style={[styles.crestText, { color: team.fg }]}>{team.code}</Text>
          </View>
          <Text style={styles.teamName}>{team.name}</Text>
        </View>

        <Text style={styles.kicker}>{t('teamProfile.recentForm')}</Text>
        <View style={styles.formRow}>
          {team.form.map((result, index) => (
            <View key={index} style={[styles.formPill, { backgroundColor: formTone[result].bg }]}>
              <Text style={[styles.formPillText, { color: formTone[result].fg }]}>{t(`teamProfile.form${result}`)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.kicker}>{t('teamProfile.upcomingMatches')}</Text>
        {upcoming.map((m) => {
          const opponent = m.home.id === team.id ? m.away : m.home;
          const favourite = favouredOutcome(m);
          const favoursThisTeam = favourite.team?.id === team.id;
          return (
            <Pressable key={m.id} style={styles.matchRow} onPress={() => router.push(`/match/${m.id}`)}>
              <TeamBadgePair home={m.home.id === team.id ? team : opponent} away={m.home.id === team.id ? opponent : team} size={28} />
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondaryAlt },
  content: { paddingHorizontal: spacing.screenX, paddingTop: 10, paddingBottom: 60 },
  heroWrap: { alignItems: 'center', marginBottom: spacing.xl },
  crest: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  crestText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  teamName: { fontFamily: fonts.headline, fontSize: 18, letterSpacing: -0.3, color: colors.textPrimary, marginTop: spacing.sm },
  kicker: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textFaint, marginBottom: spacing.md },
  formRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.xl },
  formPill: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  formPillText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: spacing.sm,
  },
  matchInfo: { flex: 1 },
  matchTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  matchSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  matchTag: { fontFamily: fonts.bodyMedium, fontSize: 10.5 },
  matchTagPositive: { color: colors.successText },
  matchTagNeutral: { color: colors.textFaint },
  emptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
});
