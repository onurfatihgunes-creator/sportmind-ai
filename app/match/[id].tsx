import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, BookmarkSimpleIcon, SoccerBallIcon, SparkleIcon } from 'phosphor-react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { panesForWidth } from '@/constants/layout';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { type Match } from '@/data/mockData';
import { resolveMatchById } from '@/data/liveData';
import { useAppData } from '@/contexts/DataContext';
import { useWatchlist } from '@/contexts/WatchlistContext';
import { useEntitlement } from '@/contexts/EntitlementContext';
import MatchAnalysisContent, { type MatchAnalysisTab } from '@/components/MatchAnalysisContent';
import NotFoundState from '@/components/NotFoundState';
import Toast, { useToast } from '@/components/Toast';

export default function MatchAnalysisScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; tab?: string }>();
  const { matches, isLive } = useAppData();
  const { isWatched, toggle } = useWatchlist();
  const { toastState, showToast } = useToast();
  const { status: entitlementStatus } = useEntitlement();
  const layout = useAdaptiveLayout();
  const localMatch = matches.find((m) => m.id === params.id) ?? null;

  // A match id absent from the currently-loaded top-30-per-sport window (a stale/shared
  // deep link, or a match that has since rotated out of it) is NOT the same as an
  // invalid id — resolveMatchById asks Supabase directly, the one real yes/no source for
  // "does this match exist." Never falls back to a different match; only ever narrows to
  // "this exact id, or genuinely not found." Skipped entirely on mock data (isLive
  // false) — there's nothing else to ask.
  const [fallbackMatch, setFallbackMatch] = useState<Match | null>(null);
  const [resolving, setResolving] = useState(false);
  useEffect(() => {
    if (localMatch || !params.id) {
      setFallbackMatch(null);
      setResolving(false);
      return;
    }
    if (!isLive) {
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    resolveMatchById(params.id).then((m) => {
      if (!cancelled) {
        setFallbackMatch(m);
        setResolving(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [localMatch, params.id, isLive]);

  const match = localMatch ?? fallbackMatch;
  // Deliberately above the layout branch: on iPhone Duo the window resizes when the
  // device is folded, unfolded, rotated or dragged in Split View, and the selected tab
  // must survive all four. Same reason the resolve effect above keys off the id only —
  // a fold must never re-ask Supabase for a match it has already resolved.
  const [tab, setTab] = useState<MatchAnalysisTab>(
    params.tab === 'change' ? 'change' : params.tab === 'reasons' ? 'reasons' : 'summary',
  );

  const watched = match ? isWatched(match.id) : false;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('matchAnalysis.title')}</Text>
        {match ? (
          <Pressable
            style={styles.iconButton}
            onPress={() => {
              toggle(match.id);
              showToast(watched ? t('common.savedToastRemoved') : t('common.savedToastAdded'));
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={watched ? t('common.savedToastRemoved') : t('common.savedToastAdded')}
          >
            <BookmarkSimpleIcon size={19} weight={watched ? 'fill' : 'regular'} color={watched ? colors.primary : colors.textFaint} />
          </Pressable>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>
      <Toast state={toastState} />

      {!match ? (
        !resolving && (
          <NotFoundState
            icon={SoccerBallIcon}
            title={t('notFound.matchTitle')}
            body={t('notFound.matchBody')}
            ctaLabel={t('common.goBack')}
            onPressCta={() => router.back()}
          />
        )
      ) : entitlementStatus === 'expired' ? (
        // The gated "Pro deneyimi" boundary: SportMind's own core value is this AI
        // analysis, the same product boundary Stylist gates its one protected action
        // at. 'loading' deliberately falls through to the real content below rather
        // than landing here — see EntitlementContext's own header for why an unknown
        // state must never be presented as "Pro required."
        <NotFoundState
          icon={SparkleIcon}
          title={t('pro.gateTitle')}
          body={t('pro.gateBody')}
          ctaLabel={t('pro.upgradeExpired')}
          onPressCta={() => router.push('/(tabs)/premium')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <MatchAnalysisContent
            match={match}
            tab={tab}
            onTabChange={setTab}
            // This route owns the full content width, so it is the one place the
            // analysis can genuinely use two columns. Explore's detail pane answers the
            // same question about its own, much narrower width and gets 'single'.
            columns={panesForWidth(layout.contentWidth)}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondaryAlt },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 60 },
});
