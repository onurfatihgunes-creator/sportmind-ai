import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, ClockCountdownIcon, SparkleIcon, XIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { railInsetStyle, singleColumnStyle, useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { completePurchase, isPurchaseConfigured, restorePurchases, startPurchase } from '@/services/purchase';
import Toast, { useToast } from '@/components/Toast';

/**
 * SportMind Pro — the paywall, and the one place a purchase is started.
 *
 * TRANSPLANTED FROM STYLIST's app/pro.tsx: same state machine (idle →
 * purchasing → refreshing → confirmed), same rule that only a re-read of
 * the entitlement source may unlock anything, same "no countdown, no
 * last-chance, no strikethrough" tone. What differs is SportMind's own
 * branding and visual language (this app's existing card/button idiom, not
 * Stylist's component library) and the fact that no benefit LIST is
 * invented here — Pro continues exactly what the trial already gave (no
 * time limit, not a bigger feature set), so there is nothing to enumerate.
 *
 * THE PRICE SHOWN (pro.price/pro.priceSuffix) IS REAL, HUMAN-CONFIRMED
 * PRODUCT COPY (₺49.90/month) — informational, not the purchase flow
 * itself. It is deliberately separate from isPurchaseConfigured(): showing
 * the real intended price is fine before a store product exists; letting
 * someone tap a button that can't actually charge them is not, so the CTA
 * stays gated exactly as before regardless of this text being here.
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
  const layout = useAdaptiveLayout();
  const { t } = useTranslation();
  const { status, trialEndsAt, refresh } = useEntitlement();
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

  // Real, backend-sourced end-of-trial timestamp — never a client-side guess. Rounded
  // up (not down) so the chip reads "1 day left" through the whole final day rather
  // than dropping to a misleading "0" hours before it actually ends. Only ever shown
  // for status === 'trial' with a real trialEndsAt — an expired/pro/unknown state, or
  // a trial whose end date this device hasn't been told, shows nothing rather than a
  // guessed number.
  const trialDaysLeft = useMemo(() => {
    if (status !== 'trial' || trialEndsAt == null) return null;
    const days = Math.ceil((trialEndsAt - Date.now()) / 86_400_000);
    return days > 0 ? days : null;
  }, [status, trialEndsAt]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.shell, railInsetStyle(layout)]}>
        {/* Inside the rail inset and capped to the same column as the page below it: an
            X pinned to the far edge of a wide window is 70-odd points adrift of the
            sheet it closes, and reads as belonging to nothing. */}
        <View style={[styles.closeRow, singleColumnStyle(layout)]}>
          <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={12}>
            <XIcon size={19} color={colors.textFaint} />
          </Pressable>
        </View>
      <ScrollView contentContainerStyle={[styles.content, singleColumnStyle(layout), layout.wide && styles.contentWide]} showsVerticalScrollIndicator={false}>
        <View style={styles.icon}>
          <SparkleIcon size={24} weight="bold" color={colors.primaryTint} />
        </View>
        <Text style={styles.title}>{t('pro.title')}</Text>

        {status === 'pro' ? (
          <View style={styles.activeBadge}>
            <CheckCircleIcon size={14} weight="fill" color={colors.successText} />
            <Text style={styles.activeBadgeText}>{t('pro.active')}</Text>
          </View>
        ) : trialDaysLeft != null ? (
          <View style={styles.trialBadge}>
            <ClockCountdownIcon size={14} weight="bold" color={colors.warningText} />
            <Text style={styles.trialBadgeText}>{t('pro.trialDaysLeft', { count: trialDaysLeft })}</Text>
          </View>
        ) : null}

        <Text style={styles.heading}>{t('pro.heading')}</Text>
        <Text style={styles.body}>
          {status === 'expired' ? t('pro.bodyExpired') : t('pro.body')}
        </Text>

        {status !== 'pro' && (
          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceValue}>{t('pro.price')}</Text>
              <Text style={styles.priceSuffix}>{t('pro.priceSuffix')}</Text>
            </View>
            <Text style={styles.priceCaption}>{t('pro.billedMonthly')}</Text>
          </View>
        )}

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
      </ScrollView>
      </View>
      <Toast state={toastState} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  // No bottom tab bar to clear once the navigation has become a side rail.
  contentWide: { paddingBottom: 40 },
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
  trialBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.warningMuted,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 10,
  },
  trialBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.warningText },
  heading: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary, marginBottom: 8 },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 21, color: colors.textTertiary, maxWidth: 300, marginBottom: 20 },
  priceCard: {
    alignSelf: 'flex-start',
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryTint,
    marginBottom: 20,
  },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  priceValue: { fontFamily: fonts.headline, fontSize: 28, letterSpacing: -0.6, color: colors.textPrimary },
  priceSuffix: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textTertiary, marginBottom: 3 },
  priceCaption: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 4 },
  actions: { marginTop: 4, gap: 10 },
  cta: { minHeight: 54, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  ctaPressed: { backgroundColor: colors.primaryLinkHover },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.highlightText },
  restoreButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  restoreButtonText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primaryLink },
  unavailable: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textFaint, marginTop: 4 },
});
