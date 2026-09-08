import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, SparkleIcon, XIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { completePurchase, isPurchaseConfigured, restorePurchases, startPurchase } from '@/services/purchase';
import Toast, { useToast } from '@/components/Toast';

/**
 * SportMind Pro — the paywall, and the one place a purchase is started.
 *
 * TRANSPLANTED FROM STYLIST's app/pro.tsx: same state machine (idle →
 * purchasing → refreshing → confirmed), same rule that only a re-read of
 * the entitlement source may unlock anything, same refusal to fabricate a
 * price/currency/period, same "no countdown, no last-chance, no
 * strikethrough" tone. What differs is SportMind's own branding and visual
 * language (this app's existing card/button idiom, not Stylist's
 * component library) and the fact that no benefit list is invented here
 * either — Pro continues exactly what the trial already gave, so there is
 * nothing to enumerate.
 *
 * REACHED FROM: Profile's "Go Pro"/"Upgrade to Pro" row, Home's header
 * pill, and the Pro-required state on Match Analysis once a trial has
 * ended (see app/match/[id].tsx). Never a bottom tab — see
 * app/(tabs)/_layout.tsx, where this route's tab bar entry is permanently
 * hidden; it lives under (tabs) only so router.push('/(tabs)/premium')
 * keeps working without a bigger route reshuffle.
 */
type Stage = 'idle' | 'purchasing' | 'refreshing' | 'confirmed';

export default function PremiumScreen() {
  const { t } = useTranslation();
  const { status, refresh } = useEntitlement();
  const { toastState, showToast } = useToast();
  const [stage, setStage] = useState<Stage>('idle');
  const configured = isPurchaseConfigured();

  const buy = useCallback(async () => {
    if (stage !== 'idle') return;
    setStage('purchasing');
    const bought = await startPurchase();
    if (!bought.ok) {
      setStage('idle');
      if (bought.reason === 'cancelled') return;
      showToast(t(bought.reason === 'unavailable' ? 'pro.unavailable' : 'pro.failed'));
      return;
    }
    setStage('refreshing');
    const confirmed = await completePurchase();
    if (!confirmed.ok) {
      setStage('idle');
      showToast(t('pro.pending'));
      return;
    }
    setStage('confirmed');
    showToast(t('pro.confirmed'));
    await refresh();
    router.back();
  }, [stage, t, showToast, refresh]);

  const restore = useCallback(async () => {
    if (stage !== 'idle') return;
    setStage('refreshing');
    const restored = await restorePurchases();
    if (!restored.ok) {
      setStage('idle');
      showToast(t(restored.reason === 'unavailable' ? 'pro.unavailable' : 'pro.nothingToRestore'));
      return;
    }
    setStage('confirmed');
    showToast(t('pro.confirmed'));
    await refresh();
    router.back();
  }, [stage, t, showToast, refresh]);

  const working = stage === 'purchasing' || stage === 'refreshing';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.closeRow}>
        <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={12}>
          <XIcon size={19} color={colors.textFaint} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.icon}>
          <SparkleIcon size={24} weight="bold" color={colors.primaryTint} />
        </View>
        <Text style={styles.title}>{t('pro.title')}</Text>

        {status === 'pro' ? (
          <View style={styles.activeBadge}>
            <CheckCircleIcon size={14} weight="fill" color={colors.successText} />
            <Text style={styles.activeBadgeText}>{t('pro.active')}</Text>
          </View>
        ) : null}

        <Text style={styles.heading}>{t('pro.heading')}</Text>
        <Text style={styles.body}>
          {status === 'expired' ? t('pro.bodyExpired') : t('pro.body')}
        </Text>

        {/*
          THE PRICE'S PLACE IS DELIBERATELY EMPTY. It belongs to the store,
          localised, with its own real currency and billing period — see
          services/purchase.ts's header for why nothing is drawn here until
          there is a real one to draw. SportMind Pro's price (49.99) is the
          number to enter when that product is created in App Store
          Connect / Google Play Console, not UI copy.
        */}

        {status === 'pro' ? null : configured ? (
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed, working && styles.ctaDisabled]}
              onPress={() => void buy()}
              disabled={working}
            >
              <Text style={styles.ctaText}>{stage === 'refreshing' ? t('pro.confirming') : t('pro.upgrade')}</Text>
            </Pressable>
            <Pressable style={styles.restoreButton} onPress={() => void restore()} disabled={working}>
              <Text style={styles.restoreButtonText}>{t('pro.restore')}</Text>
            </Pressable>
          </View>
        ) : (
          // No purchase provider is configured yet — said plainly rather than
          // dressed up as a temporary glitch, matching Stylist's own wording.
          <Text style={styles.unavailable}>{t('pro.unavailable')}</Text>
        )}

        <View style={styles.linksRow}>
          <Pressable onPress={() => router.push('/legal')}>
            <Text style={styles.link}>{t('common.terms')}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/legal')}>
            <Text style={styles.link}>{t('common.privacy')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      <Toast state={toastState} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundGradientTop },
  closeRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 10, paddingTop: 4 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 60 },
  icon: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.headline, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, color: colors.textPrimary, marginTop: 16, marginBottom: 8 },
  activeBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.successMuted,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 10,
  },
  activeBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.successText },
  heading: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary, marginBottom: 8 },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 21, color: colors.textTertiary, maxWidth: 300, marginBottom: 20 },
  actions: { marginTop: 4, gap: 10 },
  cta: { minHeight: 54, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  ctaPressed: { backgroundColor: colors.primaryLinkHover },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.highlightText },
  restoreButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  restoreButtonText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primaryLink },
  unavailable: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textFaint, marginTop: 4 },
  linksRow: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 28 },
  link: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLink },
});
