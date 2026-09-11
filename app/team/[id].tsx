import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon, ShieldIcon } from 'phosphor-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { favouredOutcome, type Team } from '@/data/mockData';
import { resolveTeamById } from '@/data/liveData';
import { useAppData } from '@/contexts/DataContext';
import TeamBadgePair from '@/components/TeamBadgePair';
import SplitPane from '@/components/SplitPane';
import Disclaimer from '@/components/Disclaimer';
import NotFoundState from '@/components/NotFoundState';

const formTone = {
  W: { bg: colors.successMuted, fg: colors.successText },
  D: { bg: colors.divider, fg: colors.textSecondaryAlt },
  L: { bg: colors.dangerMuted, fg: colors.dangerText },
} as const;

export default function TeamProfileScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { teams, matches, isLive } = useAppData();
  const layout = useAdaptiveLayout();
  const dual = layout.panes === 'dual';
  const localTeam = (id && teams[id]) || null;

  // Same rationale as match/[id].tsx: a team absent from the bulk-loaded `teams` map (it
  // only ever contains teams referenced by the currently-loaded match window) is not the
  // same as an invalid id. resolveTeamById asks Supabase directly instead of falling back
  // to a different team.
  const [fallbackTeam, setFallbackTeam] = useState<Team | null>(null);
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    if (localTeam || !id) {
      setFallbackTeam(null);
      setResolving(false);
      return;
    }
    if (!isLive) {
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    resolveTeamById(id).then((resolved) => {
      if (!cancelled) {
        setFallbackTeam(resolved);
        setResolving(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [localTeam, id, isLive]);

  const team = localTeam ?? fallbackTeam;
  const upcoming = team ? matches.filter((m) => m.home.id === team.id || m.away.id === team.id) : [];

  if (!team) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
            <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('teamProfile.title')}</Text>
        </View>
        {!resolving && (
          <NotFoundState
            icon={ShieldIcon}
            title={t('notFound.teamTitle')}
            body={t('notFound.teamBody')}
            ctaLabel={t('common.goBack')}
            onPressCta={() => router.back()}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('teamProfile.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ENTITY -> RELATED DATA. Who the team is and how it has been going stays put on
            one side while its fixture list scrolls on the other, instead of the identity
            scrolling away the moment you look past the third match. */}
        <SplitPane
          dual={dual}
          primaryFlex={1}
          secondaryFlex={1.5}
          primary={<View style={dual ? styles.identityInPane : undefined}>
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
          </View>}
          secondary={<View>
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
          </View>}
        />

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
  // Side by side the identity column reads as a panel beside the fixtures rather than a
  // centred banner above them — the crest, name and form align with the list's first row.
  identityInPane: { alignItems: 'flex-start' },
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
