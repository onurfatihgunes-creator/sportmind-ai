import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckIcon, MinusIcon, SparkleIcon, XIcon } from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import SegmentedControl from '@/components/SegmentedControl';
import { MAX_FOLLOWED_TEAMS } from '@/contexts/FollowedTeamsContext';

const rows = [
  { labelKey: 'dailyAnalyses', free: '1', premium: 'unlimited' },
  { labelKey: 'advancedExplanations', free: false, premium: true },
  { labelKey: 'historicalComparisons', free: false, premium: true },
  { labelKey: 'watchlistLimit', free: String(MAX_FOLLOWED_TEAMS), premium: 'unlimited' },
] as const;

export default function PremiumScreen() {
  const { t } = useTranslation();
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('yearly');
  const yearly = plan === 'yearly';

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
        <Text style={styles.title}>{t('premium.goDeeper')}</Text>
        <Text style={styles.subtitle}>{t('premium.dailyLimitReached')}</Text>

        <SegmentedControl
          style={styles.segment}
          height={42}
          fontSize={13}
          options={[
            { key: 'monthly', label: t('premium.monthly') },
            {
              key: 'yearly',
              label: t('premium.yearly'),
              badge: (
                <View style={styles.saveBadge}>
                  <Text style={styles.saveBadgeText}>%30</Text>
                </View>
              ),
            },
          ]}
          value={plan}
          onChange={(k) => setPlan(k as 'monthly' | 'yearly')}
        />

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell} />
            <Text style={[styles.tableHeaderCell, styles.tableHeaderCellCenter]}>{t('premium.free')}</Text>
            <Text style={[styles.tableHeaderCell, styles.tableHeaderCellCenter, { color: colors.primaryText, fontFamily: fonts.bodySemiBold }]}>
              {t('premium.premiumCol')}
            </Text>
          </View>
          {rows.map((row) => (
            <View key={row.labelKey} style={styles.tableRow}>
              <Text style={styles.tableLabel}>{t(`premium.${row.labelKey}`)}</Text>
              <View style={styles.tableCellCenter}>
                {typeof row.free === 'string' ? (
                  <Text style={styles.tableValueMuted}>{row.free}</Text>
                ) : (
                  <MinusIcon size={13} weight="bold" color={colors.textFaintest} />
                )}
              </View>
              <View style={styles.tableCellCenter}>
                {row.premium === 'unlimited' ? (
                  <Text style={styles.tableValueStrong}>{t('premium.unlimited')}</Text>
                ) : (
                  <CheckIcon size={14} weight="bold" color={colors.success} />
                )}
              </View>
            </View>
          ))}
        </View>

        <Pressable style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
          <Text style={styles.ctaText}>{yearly ? t('premium.startPremiumYearly') : t('premium.startPremiumMonthly')}</Text>
        </Pressable>
        <Text style={styles.fineprint}>{yearly ? t('premium.billedYearly') : t('premium.billedMonthly')}</Text>

        <View style={styles.linksRow}>
          <Text style={styles.link}>{t('common.restorePurchases')}</Text>
          <Text style={styles.link}>{t('common.terms')}</Text>
        </View>
      </ScrollView>
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
  subtitle: { fontFamily: fonts.body, fontSize: 13, lineHeight: 21, color: colors.textTertiary, maxWidth: 290, marginBottom: 20 },
  segment: { alignSelf: 'flex-start', marginBottom: 16 },
  saveBadge: { backgroundColor: colors.primaryTintStrong, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2, marginLeft: 4 },
  saveBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 9, color: colors.primaryText },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, overflow: 'hidden', marginBottom: 18 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surfaceSubtle },
  tableHeaderCell: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
  tableHeaderCellCenter: { textAlign: 'center', flex: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.divider },
  tableLabel: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  tableCellCenter: { flex: 0.5, alignItems: 'center' },
  tableValueMuted: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
  tableValueStrong: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.primaryText },
  cta: { minHeight: 54, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  ctaPressed: { backgroundColor: colors.primary },
  ctaText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.primaryText },
  fineprint: { fontFamily: fonts.body, fontSize: 11, lineHeight: 17, color: colors.textFainter, textAlign: 'center', marginTop: 12 },
  linksRow: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 12 },
  link: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLink },
});
