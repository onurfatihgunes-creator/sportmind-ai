import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon, CaretDownIcon, CaretRightIcon, CaretUpIcon, CpuIcon, FileIcon, FileTextIcon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import MethodologyContent from '@/components/MethodologyContent';

const PRIVACY_POLICY_URL = 'https://onurfatihgunes-creator.github.io/sportmind-ai/privacy-policy.html';
const TERMS_OF_SERVICE_URL = 'https://onurfatihgunes-creator.github.io/sportmind-ai/terms-of-service.html';

// Real, previously-unreported runtime error: Linking.openURL() returns a promise that
// rejects when the URL can't be opened (no network reachability, no app registered to
// handle it, etc.) — with no .catch() anywhere, that rejection surfaced to the user as an
// "Uncaught (in promise) Error: Unable to..." overlay instead of failing quietly. This
// doesn't hide a real problem: there is nothing actionable for the user to do differently,
// so a silent, logged failure is the honest behavior here (same as any other best-effort
// external link) — not a real product decision requiring a visible error state.
function openExternalUrl(url: string) {
  Linking.openURL(url).catch((error) => {
    console.warn(`Failed to open external URL: ${url}`, error);
  });
}

type LegalLink =
  | { type: 'external'; Icon: typeof FileTextIcon; labelKey: string; url: string }
  | { type: 'expandable'; Icon: typeof FileTextIcon; labelKey: string };

// Store-required and actually-reachable links only. The disclaimer/responsible-AI/
// responsible-use/licences/data-sources rows that used to live here had no onPress at
// all — dead taps. Removed rather than wired up: the disclaimer content they'd have
// pointed to is already shown inline (see components/Disclaimer.tsx on Match/Team/My
// Matches), and none of privacyPolicy/termsOfService/methodology's siblings are
// themselves required by App Store/Play Store review — only Privacy Policy and Terms of
// Service are (methodology stays because it already links to real content).
const links: LegalLink[] = [
  { type: 'external', Icon: FileTextIcon, labelKey: 'privacyPolicy', url: PRIVACY_POLICY_URL },
  { type: 'external', Icon: FileIcon, labelKey: 'termsOfService', url: TERMS_OF_SERVICE_URL },
  { type: 'expandable', Icon: CpuIcon, labelKey: 'methodology' },
];

export default function LegalHubScreen() {
  const { t } = useTranslation();
  // Methodology expands INLINE here instead of navigating to a separate screen — the
  // same content is still also reachable as its own route (app/legal/methodology.tsx,
  // linked directly from Profile's "How the model works" row), this is purely an
  // additional, faster path for the one row where users complained about an unnecessary
  // extra screen + back-navigation for content that reads fine inline.
  const [methodologyExpanded, setMethodologyExpanded] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('legal.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          {links.map((link, index) => {
            const isLast = index === links.length - 1;
            const expanded = link.type === 'expandable' && methodologyExpanded;
            return (
              <View key={link.labelKey}>
                <Pressable
                  onPress={() => (link.type === 'external' ? openExternalUrl(link.url) : setMethodologyExpanded((v) => !v))}
                  style={[styles.row, !isLast && !expanded && styles.rowBorder]}
                  accessibilityRole="button"
                  accessibilityState={link.type === 'expandable' ? { expanded } : undefined}
                >
                  <link.Icon size={17} color={colors.primary} />
                  <Text style={styles.label}>{t(`legal.${link.labelKey}`)}</Text>
                  {link.type === 'expandable' ? (
                    expanded ? (
                      <CaretUpIcon size={13} weight="bold" color={colors.textFaintest} />
                    ) : (
                      <CaretDownIcon size={13} weight="bold" color={colors.textFaintest} />
                    )
                  ) : (
                    <CaretRightIcon size={13} weight="bold" color={colors.textFaintest} />
                  )}
                </Pressable>
                {expanded && (
                  <View style={[styles.expandedContent, !isLast && styles.rowBorder]}>
                    <MethodologyContent />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingBottom: 4 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.screenX, paddingTop: 10, paddingBottom: 60 },
  group: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 52 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  label: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  expandedContent: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, backgroundColor: colors.background },
});
