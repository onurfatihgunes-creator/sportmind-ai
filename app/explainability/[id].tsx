import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';
import { favouredOutcome, matches, signalWeights } from '@/data/mockData';
import SignalBar from '@/components/SignalBar';
import Disclaimer from '@/components/Disclaimer';

export default function ExplainabilityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = matches.find((m) => m.id === id) ?? matches[0];
  const favourite = favouredOutcome(match);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {match.home.name} vs {match.away.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroText}>
          <Text style={styles.confidence}>{favourite.probability}%</Text>
          <Text style={styles.confidenceCaption}>
            {favourite.team ? `${favourite.team.name} win likelihood` : 'Draw likelihood'}
          </Text>
          <Text style={styles.question}>Why does the AI think this?</Text>
        </View>

        {signalWeights.map((s) => (
          <SignalBar key={s.label} label={s.label} value={s.value} />
        ))}

        <Disclaimer style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.textSecondary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  heroText: { alignItems: 'center', marginBottom: spacing.xxl },
  confidence: { fontFamily: fonts.headlineBold, fontSize: 40, color: colors.textPrimary },
  confidenceCaption: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textMuted, marginTop: 2 },
  question: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, marginTop: 10 },
});
