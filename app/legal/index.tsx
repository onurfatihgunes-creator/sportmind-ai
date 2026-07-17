import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';

const PRIVACY_POLICY_URL = 'https://onurfatihgunes-creator.github.io/sportmind-ai/privacy-policy.html';
const TERMS_OF_SERVICE_URL = 'https://onurfatihgunes-creator.github.io/sportmind-ai/terms-of-service.html';

type LegalLink = { icon: keyof typeof Feather.glyphMap; labelKey: string; onPress?: () => void };

const links: LegalLink[] = [
  { icon: 'file-text', labelKey: 'privacyPolicy', onPress: () => Linking.openURL(PRIVACY_POLICY_URL) },
  { icon: 'file', labelKey: 'termsOfService', onPress: () => Linking.openURL(TERMS_OF_SERVICE_URL) },
  { icon: 'alert-circle', labelKey: 'disclaimer' },
  { icon: 'shield', labelKey: 'responsibleAI' },
  { icon: 'heart', labelKey: 'responsibleUse' },
  { icon: 'cpu', labelKey: 'methodology', onPress: () => router.push('/legal/methodology') },
  { icon: 'code', labelKey: 'licences' },
  { icon: 'database', labelKey: 'dataSources' },
];

export default function LegalHubScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
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
              <View style={styles.rowLeft}>
                <Feather name={link.icon} size={15} color={colors.textSecondary} />
                <Text style={styles.label}>{t(`legal.${link.labelKey}`)}</Text>
              </View>
              <Feather name="chevron-right" size={14} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.headline, fontSize: 14, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: fonts.body, fontSize: 12.5, color: '#E5E7EB' },
});
