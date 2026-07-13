import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { insights, matches } from '@/data/mockData';
import MatchCard from '@/components/MatchCard';
import InsightCard from '@/components/InsightCard';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingSmall}>Good evening</Text>
            <Text style={styles.greetingName}>Onur</Text>
          </View>
          <LinearGradient colors={[colors.primary, '#7C3AED']} style={styles.avatar}>
            <Feather name="zap" size={16} color="#fff" />
          </LinearGradient>
        </View>

        <Text style={styles.sectionLabel}>Today's key matches</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.matchRow}
          contentContainerStyle={{ paddingRight: spacing.xxl }}
        >
          {matches.slice(0, 2).map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </ScrollView>

        <LinearGradient
          colors={['#1E1B4B', colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.3 }}
          style={styles.highlightCard}
        >
          <View style={styles.highlightLabelRow}>
            <Feather name="zap" size={12} color={colors.primaryLight} />
            <Text style={styles.highlightLabel}>AI match highlight</Text>
          </View>
          <Text style={styles.highlightTitle}>3 things changed overnight</Text>
          <Text style={styles.highlightSubtitle}>Lineups, weather and form all shifted since yesterday</Text>
        </LinearGradient>

        <Text style={styles.sectionLabel}>Latest AI insights</Text>
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}

        <Pressable style={styles.premiumBanner} onPress={() => router.push('/(tabs)/premium')}>
          <View>
            <Text style={styles.premiumTitle}>Unlock unlimited AI analysis</Text>
            <Text style={styles.premiumSubtitle}>Go Premium</Text>
          </View>
          <Feather name="lock" size={18} color={colors.primaryLight} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.md, marginBottom: spacing.xl },
  greetingSmall: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  greetingName: { fontFamily: fonts.headline, fontSize: 20, color: colors.textPrimary, marginTop: 1 },
  avatar: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: {
    fontFamily: fonts.headline,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  matchRow: { marginBottom: spacing.xl },
  highlightCard: { borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl, borderWidth: 1, borderColor: '#2E2A5C' },
  highlightLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  highlightLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primaryLight },
  highlightTitle: { fontFamily: fonts.headline, fontSize: 15, color: colors.textPrimary },
  highlightSubtitle: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 4 },
  premiumBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#312E81',
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  premiumTitle: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: '#C7D2FE' },
  premiumSubtitle: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary, marginTop: 2 },
});
