import { Alert, I18nManager, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon, CheckIcon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { RTL_LANGUAGES, SUPPORTED_LANGUAGES, setAppLanguage, type SupportedLanguage } from '@/i18n';

export default function LanguageScreen() {
  const { t, i18n } = useTranslation();

  const selectLanguage = async (language: SupportedLanguage) => {
    const wasRTL = I18nManager.isRTL;
    await setAppLanguage(language);
    const willBeRTL = RTL_LANGUAGES.includes(language);

    if (wasRTL !== willBeRTL) {
      I18nManager.allowRTL(willBeRTL);
      I18nManager.forceRTL(willBeRTL);
      if (Platform.OS === 'web') {
        window.location.reload();
      } else {
        Alert.alert(t('language.title'), t('language.rtlNotice'));
      }
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('language.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          {SUPPORTED_LANGUAGES.map((language, index) => (
            <Pressable
              key={language}
              onPress={() => selectLanguage(language)}
              style={[styles.row, index < SUPPORTED_LANGUAGES.length - 1 && styles.rowBorder]}
            >
              <Text style={styles.label}>{t(`language.${language}`)}</Text>
              {i18n.language === language && <CheckIcon size={16} weight="bold" color={colors.primary} />}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, minHeight: 52 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
});
