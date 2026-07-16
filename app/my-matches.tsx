import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import { useWatchlist } from '@/contexts/WatchlistContext';
import TeamCrest from '@/components/TeamCrest';
import ConfidenceRing from '@/components/ConfidenceRing';
import Disclaimer from '@/components/Disclaimer';

export default function MyMatchesScreen() {
  const { t } = useTranslation();
  const { matches } = useAppData();
  const { matchIds, toggle } = useWatchlist();
  const savedMatches = matches.filter((m) => matchIds.includes(m.id));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('myMatches.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {savedMatches.length > 0 && <Text style={styles.note}>{t('myMatches.note')}</Text>}

        {savedMatches.map((m) => {
          const favourite = favouredOutcome(m);
          return (
            <Pressable key={m.id} style={styles.card} onPress={() => router.push(`/match/${m.id}`)}>
              <View style={styles.cardTop}>
                <View style={styles.crests}>
                  <TeamCrest team={m.home} size={28} />
                  <TeamCrest team={m.away} size={28} overlap />
                </View>
                <View style={styles.cardTopRight}>
                  <ConfidenceRing value={favourite.probability} size={34} strokeWidth={3} />
                  <Pressable hitSlop={10} onPress={() => toggle(m.id)}>
                    <Feather name="bookmark" size={18} color={colors.primaryLight} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.matchTitle}>
                {m.home.name} {t('common.vs')} {m.away.name}
              </Text>
              <Text style={styles.matchSubtitle}>
                {m.kickoff} · {m.competition} ·{' '}
                {favourite.team ? t('matchCard.favoured', { team: favourite.team.name }) : t('matchCard.drawLikely')}
              </Text>
              <View style={styles.viewLink}>
                <Text style={styles.viewLinkText}>{t('common.viewFullAnalysis')}</Text>
                <Feather name="arrow-right" size={12} color={colors.primaryLight} />
              </View>
            </Pressable>
          );
        })}

        {savedMatches.length === 0 && (
          <View style={styles.emptyWrap}>
            <Feather name="bookmark" size={28} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>{t('myMatches.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('myMatches.emptyBody')}</Text>
            <Pressable style={styles.emptyCta} onPress={() => router.push('/(tabs)/explore')}>
              <Text style={styles.emptyCtaText}>{t('myMatches.browseMatches')}</Text>
            </Pressable>
          </View>
        )}

        {savedMatches.length > 0 && <Disclaimer style={{ marginTop: spacing.md }} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.headline, fontSize: 14, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  note: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 15 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  crests: { flexDirection: 'row', alignItems: 'center' },
  matchTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  matchSubtitle: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted, marginTop: 3, marginBottom: spacing.sm },
  viewLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  viewLinkText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLight },
  emptyWrap: { alignItems: 'center', paddingTop: spacing.xxl, gap: 8 },
  emptyTitle: { fontFamily: fonts.headline, fontSize: 15, color: colors.textPrimary, marginTop: 8 },
  emptyBody: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', maxWidth: 240 },
  emptyCta: { marginTop: spacing.md, backgroundColor: colors.primaryMuted, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 },
  emptyCtaText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.primaryLight },
});
