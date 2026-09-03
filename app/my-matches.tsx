import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon, ArrowRightIcon, BookmarkSimpleIcon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { favouredOutcome } from '@/data/mockData';
import { useAppData } from '@/contexts/DataContext';
import { useWatchlist } from '@/contexts/WatchlistContext';
import TeamBadgePair from '@/components/TeamBadgePair';
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
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('myMatches.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {savedMatches.length > 0 && <Text style={styles.note}>{t('myMatches.note')}</Text>}

        {savedMatches.map((m) => {
          const favourite = favouredOutcome(m);
          return (
            <Pressable key={m.id} style={styles.card} onPress={() => router.push(`/match/${m.id}`)}>
              <View style={styles.cardTop}>
                <TeamBadgePair home={m.home} away={m.away} size={28} />
                <View style={styles.cardTopRight}>
                  <ConfidenceRing value={favourite.probability} size={34} strokeWidth={3} showLabel={false} />
                  <Pressable hitSlop={10} onPress={() => toggle(m.id)}>
                    <BookmarkSimpleIcon size={18} weight="fill" color={colors.primary} />
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
                <ArrowRightIcon size={12} weight="bold" color={colors.primaryLink} />
              </View>
            </Pressable>
          );
        })}

        {savedMatches.length === 0 && (
          <View style={styles.emptyWrap}>
            <BookmarkSimpleIcon size={28} color={colors.textFainter} />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.screenX, paddingTop: 10, paddingBottom: 60 },
  note: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginBottom: spacing.lg, lineHeight: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  matchTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  matchSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 3, marginBottom: spacing.sm },
  viewLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  viewLinkText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.primaryLink },
  emptyWrap: { alignItems: 'center', paddingTop: spacing.xxl, gap: 8 },
  emptyTitle: { fontFamily: fonts.headline, fontSize: 16, color: colors.textPrimary, marginTop: 8 },
  emptyBody: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', maxWidth: 240 },
  emptyCta: { marginTop: spacing.md, backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.borderHover, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 12 },
  emptyCtaText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.primaryLink },
});
