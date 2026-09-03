import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeftIcon,
  CaretRightIcon,
  CodeIcon,
  CpuIcon,
  DatabaseIcon,
  FileIcon,
  FileTextIcon,
  HeartIcon,
  ShieldIcon,
  WarningCircleIcon,
} from 'phosphor-react-native';
import type { Icon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';

const PRIVACY_POLICY_URL = 'https://onurfatihgunes-creator.github.io/sportmind-ai/privacy-policy.html';
const TERMS_OF_SERVICE_URL = 'https://onurfatihgunes-creator.github.io/sportmind-ai/terms-of-service.html';

type LegalLink = { Icon: Icon; labelKey: string; onPress?: () => void };

const links: LegalLink[] = [
  { Icon: FileTextIcon, labelKey: 'privacyPolicy', onPress: () => Linking.openURL(PRIVACY_POLICY_URL) },
  { Icon: FileIcon, labelKey: 'termsOfService', onPress: () => Linking.openURL(TERMS_OF_SERVICE_URL) },
  { Icon: WarningCircleIcon, labelKey: 'disclaimer' },
  { Icon: ShieldIcon, labelKey: 'responsibleAI' },
  { Icon: HeartIcon, labelKey: 'responsibleUse' },
  { Icon: CpuIcon, labelKey: 'methodology', onPress: () => router.push('/legal/methodology') },
  { Icon: CodeIcon, labelKey: 'licences' },
  { Icon: DatabaseIcon, labelKey: 'dataSources' },
];

export default function LegalHubScreen() {
  const { t } = useTranslation();

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
          {links.map((link, index) => (
            <Pressable
              key={link.labelKey}
              onPress={link.onPress ?? (() => {})}
              style={[styles.row, index < links.length - 1 && styles.rowBorder]}
            >
              <link.Icon size={17} color={colors.primary} />
              <Text style={styles.label}>{t(`legal.${link.labelKey}`)}</Text>
              <CaretRightIcon size={13} weight="bold" color={colors.textFaintest} />
            </Pressable>
          ))}
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
});
