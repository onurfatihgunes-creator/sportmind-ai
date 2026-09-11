import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowRightIcon,
  BellIcon,
  BookmarkSimpleIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CpuIcon,
  GlobeIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
  SparkleIcon,
} from 'phosphor-react-native';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { railInsetStyle, singleColumnStyle, useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { useProfile } from '@/contexts/ProfileContext';
import { useWatchlist } from '@/contexts/WatchlistContext';
import { useEntitlement } from '@/contexts/EntitlementContext';

export default function ProfileScreen() {
  const layout = useAdaptiveLayout();
  const { t, i18n } = useTranslation();
  const { name, setName } = useProfile();
  const { matchIds } = useWatchlist();
  const { status } = useEntitlement();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const saveName = () => {
    setName(draft);
    setEditing(false);
  };

  const exportData = async () => {
    const payload = { name, language: i18n.language, watchlistMatchIds: matchIds, exportedAt: new Date().toISOString() };
    try {
      await Share.share({ message: JSON.stringify(payload, null, 2) });
    } catch {
      // User cancelled the share sheet — nothing to do.
    }
  };

  const clearData = () => {
    Alert.alert(t('profile.clearDataTitle'), t('profile.clearDataBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.clearDataConfirm'),
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove([
            'sportmind_profile_name',
            'sportmind_watchlist_match_ids',
            'sportmind_followed_team_ids',
            'sportmind-ai-language',
            'sportmind_notification_prefs',
          ]);
          if (Platform.OS === 'web') {
            window.location.reload();
          } else {
            Alert.alert(t('profile.clearDataTitle'), t('profile.restartNotice'));
          }
        },
      },
    ]);
  };

  const rows = [
    { Icon: BookmarkSimpleIcon, label: t('profile.savedAnalyses'), value: String(matchIds.length), onPress: () => router.push('/my-matches') },
    { Icon: GlobeIcon, label: t('profile.language'), value: t(`language.${i18n.language}`), onPress: () => router.push('/language') },
    { Icon: BellIcon, label: t('profile.notifications'), onPress: () => router.push('/notifications') },
    { Icon: CpuIcon, label: t('profile.howModelWorks'), onPress: () => router.push('/legal/methodology') },
    { Icon: ShieldCheckIcon, label: t('profile.legalAndTransparency'), onPress: () => router.push('/legal') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.shell, railInsetStyle(layout)]}>
      <ScrollView contentContainerStyle={[styles.content, singleColumnStyle(layout), layout.wide && styles.contentWide]} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('tabs.profile')}</Text>

        <View style={styles.userCard}>
          <LinearGradient colors={[colors.primarySecondaryTone, colors.primary]} style={styles.avatar}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            {editing ? (
              <TextInput
                style={styles.nameInput}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={saveName}
                onBlur={saveName}
                autoFocus
                maxLength={24}
                placeholder={t('profile.namePlaceholder')}
                placeholderTextColor={colors.textFaint}
              />
            ) : (
              <Text style={styles.name}>{name}</Text>
            )}
            {/* Replaces the old static "Free plan · 1 analysis a day" line, which was
                never backed by any real daily-quota enforcement anywhere in this app —
                just UI copy. This now reflects the real, server-computed entitlement
                state. Nothing is rendered while it is still loading rather than
                guessing and possibly showing the wrong plan for a moment. */}
            {status !== 'loading' && (
              <Text style={styles.plan}>
                {t(status === 'pro' ? 'profile.planPro' : status === 'expired' ? 'profile.planExpired' : 'profile.planTrial')}
              </Text>
            )}
          </View>
          <Pressable style={styles.editButton} onPress={() => { setDraft(name); setEditing(true); }} hitSlop={8}>
            <PencilSimpleIcon size={16} color={colors.textFaint} />
          </Pressable>
        </View>

        {/*
          THREE STATES, EACH SHOWN ONLY WHEN IT IS TRUE — mirrors Stylist's own three
          conditions for its "Pro'ya Geç" row (hidden until entitlement is known, hidden
          for somebody who already has Pro since offering what they have is noise), with
          one deliberate SportMind-specific difference: the business requirement here is
          that a Go Pro CTA stays VISIBLE for the whole trial (not just after an ended
          trial), so unlike Stylist's current row this is not additionally conditioned on
          isPurchaseConfigured() — the paywall itself already renders the honest
          "purchasing isn't available yet" message when nothing is configured, so showing
          the entry point does not promise a working purchase it cannot deliver.
        */}
        {status === 'trial' && (
          <Pressable style={styles.upsellCard} onPress={() => router.push('/(tabs)/premium')}>
            <View style={styles.upsellIcon}>
              <SparkleIcon size={18} weight="bold" color={colors.primaryTint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.upsellTitle}>{t('pro.upgrade')}</Text>
              <Text style={styles.upsellSubtitle}>{t('profile.proUpsellSubtitle')}</Text>
            </View>
            <ArrowRightIcon size={15} weight="bold" color={colors.primary} />
          </Pressable>
        )}
        {status === 'expired' && (
          <Pressable style={[styles.upsellCard, styles.upsellCardExpired]} onPress={() => router.push('/(tabs)/premium')}>
            <View style={styles.upsellIcon}>
              <SparkleIcon size={18} weight="bold" color={colors.primaryTint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.upsellTitle}>{t('pro.upgradeExpired')}</Text>
              <Text style={styles.upsellSubtitle}>{t('profile.proExpiredSubtitle')}</Text>
            </View>
            <ArrowRightIcon size={15} weight="bold" color={colors.primary} />
          </Pressable>
        )}
        {status === 'pro' && (
          <View style={styles.proActiveRow}>
            <CheckCircleIcon size={16} weight="fill" color={colors.successText} />
            <Text style={styles.proActiveText}>{t('pro.active')}</Text>
          </View>
        )}

        <View style={styles.group}>
          {rows.map((row, index) => (
            <Pressable key={row.label} onPress={row.onPress} style={[styles.groupRow, index < rows.length - 1 && styles.groupRowBorder]}>
              <row.Icon size={17} color={colors.primary} />
              <Text style={styles.groupLabel}>{row.label}</Text>
              {row.value !== undefined && <Text style={styles.groupValue}>{row.value}</Text>}
              <CaretRightIcon size={13} weight="bold" color={colors.textFaintest} />
            </Pressable>
          ))}
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{t('profile.transparencyNote')}</Text>
        </View>

        <View style={styles.dataRow}>
          <Pressable style={styles.dataButton} onPress={exportData}>
            <Text style={styles.dataButtonText}>{t('profile.exportData')}</Text>
          </Pressable>
          <Pressable style={styles.dangerButton} onPress={clearData}>
            <Text style={styles.dangerButtonText}>{t('profile.clearData')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  // No bottom tab bar to clear once the navigation has become a side rail.
  contentWide: { paddingBottom: 40 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.screenX, paddingBottom: 120, paddingTop: spacing.sm },
  title: { fontFamily: fonts.headline, fontSize: 26, letterSpacing: -0.6, color: colors.textPrimary, marginBottom: 16 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.headline, fontSize: 20, color: colors.primaryTint },
  name: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.textPrimary, marginBottom: 3 },
  nameInput: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
    marginBottom: 3,
    ...(Platform.OS === 'web' ? { outlineStyle: 'solid', outlineWidth: 0 } : null),
  },
  plan: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  editButton: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  upsellCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderAccent,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAccentTo,
  },
  // A trial that has actually ended is a more urgent state than a voluntary mid-trial
  // upsell — same card shape, same visual language, just the existing accent border
  // pushed to full strength instead of a second, unrelated style of card.
  upsellCardExpired: { borderColor: colors.primary },
  upsellIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  upsellTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
  upsellSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textTertiaryAlt },
  proActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  proActiveText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.successText },
  group: { marginTop: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden' },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14 },
  groupRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  groupLabel: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  groupValue: { fontFamily: fonts.body, fontSize: 12, color: colors.textFainter },
  noteCard: { marginTop: 14, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  noteText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.textTertiaryAlt },
  dataRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  dataButton: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dataButtonText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondaryAlt },
  dangerButton: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dangerButtonText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.dangerText },
});
