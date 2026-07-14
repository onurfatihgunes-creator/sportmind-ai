import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';

type MethodologySection = {
  icon: keyof typeof Feather.glyphMap;
  key: string;
  iconColor?: string;
};

const sections: MethodologySection[] = [
  { icon: 'database', key: 'dataSources' },
  { icon: 'percent', key: 'confidence' },
  { icon: 'refresh-cw', key: 'whyChange' },
  { icon: 'x-circle', key: 'cannotDo', iconColor: colors.dangerText },
];

export default function MethodologyScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('methodology.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sections.map((s) => (
          <View key={s.key} style={styles.card}>
            <View style={styles.cardHeader}>
              <Feather name={s.icon} size={13} color={s.iconColor ?? colors.primaryLight} />
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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.headline, fontSize: 14, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 13, marginBottom: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textPrimary },
  cardBody: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  version: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, textAlign: 'center', marginTop: spacing.md },
});
