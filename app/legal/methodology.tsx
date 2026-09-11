import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, spacing } from '@/constants/theme';
import { singleColumnStyle, useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import MethodologyContent from '@/components/MethodologyContent';

// Still a real, standalone route — Profile's "How the model works" row links here
// directly, independent of the Legal hub's own inline accordion for the same content
// (see app/legal/index.tsx). Content itself lives in MethodologyContent so neither path
// duplicates copy or the real trackRecord data behind it.
export default function MethodologyScreen() {
  const layout = useAdaptiveLayout();
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('methodology.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, singleColumnStyle(layout)]}>
        <MethodologyContent />
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
});
