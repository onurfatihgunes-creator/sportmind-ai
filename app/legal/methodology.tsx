import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftIcon, ArrowsClockwiseIcon, DatabaseIcon, PercentIcon, XCircleIcon } from 'phosphor-react-native';
import type { Icon } from 'phosphor-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';

type MethodologySection = { Icon: Icon; key: string; iconColor?: string };

const sections: MethodologySection[] = [
  { Icon: DatabaseIcon, key: 'dataSources' },
  { Icon: PercentIcon, key: 'confidence' },
  { Icon: ArrowsClockwiseIcon, key: 'whyChange' },
  { Icon: XCircleIcon, key: 'cannotDo', iconColor: colors.dangerText },
];

export default function MethodologyScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={12}>
          <ArrowLeftIcon size={20} weight="bold" color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('methodology.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sections.map((s) => (
          <View key={s.key} style={styles.card}>
            <View style={styles.cardHeader}>
              <s.Icon size={14} weight="bold" color={s.iconColor ?? colors.primary} />
              <Text style={styles.cardTitle}>{t(`methodology.${s.key}Title`)}</Text>
            </View>
            <Text style={styles.cardBody}>{t(`methodology.${s.key}Body`)}</Text>
          </View>
        ))}
        <Text style={styles.version}>{t('methodology.version')}</Text>
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
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  cardBody: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiaryAlt, lineHeight: 18 },
  version: { fontFamily: fonts.body, fontSize: 11, color: colors.textFainter, textAlign: 'center', marginTop: spacing.md },
});
