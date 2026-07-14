import { Alert, I18nManager, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
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
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
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
              {i18n.language === language && <Feather name="check" size={16} color={colors.primaryLight} />}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { fontFamily: fonts.body, fontSize: 13, color: '#E5E7EB' },
});
