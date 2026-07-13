import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, fonts, radius, spacing } from '@/constants/theme';

type MethodologySection = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  iconColor?: string;
};

const sections: MethodologySection[] = [
  {
    icon: 'database',
    title: 'Data sources',
    body: 'Licensed match, form, and injury data updated continuously from official statistics providers.',
  },
  {
    icon: 'percent',
    title: 'How confidence is calculated',
    body: 'A weighted statistical model estimates likelihood from recent form, expected goals, and matchup context. It is an approximation, not a certainty.',
  },
  {
    icon: 'refresh-cw',
    title: 'Why analyses change',
    body: 'New data — injuries, lineups, weather — can shift the model’s output. Every material change is logged in "What changed?".',
  },
  {
    icon: 'x-circle',
    title: 'What our AI cannot do',
    body: 'It cannot guarantee outcomes, predict with certainty, or account for every unpredictable event in a match.',
    iconColor: colors.dangerText,
  },
];

export default function MethodologyScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>How our AI works</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {sections.map((s) => (
          <View key={s.title} style={styles.card}>
            <View style={styles.cardHeader}>
              <Feather name={s.icon} size={13} color={s.iconColor ?? colors.primaryLight} />
              <Text style={styles.cardTitle}>{s.title}</Text>
            </View>
            <Text style={styles.cardBody}>{s.body}</Text>
          </View>
        ))}
        <Text style={styles.version}>Version 1.0 — last reviewed this week</Text>
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
