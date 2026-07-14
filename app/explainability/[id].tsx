import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, confidenceColor, fonts, spacing } from '@/constants/theme';
import { favouredOutcome, matches } from '@/data/mockData';
import FactorCompareBar from '@/components/FactorCompareBar';
import Disclaimer from '@/components/Disclaimer';

export default function ExplainabilityScreen() {
  const { t } = useTranslation();
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
          {match.home.name} {t('common.vs')} {match.away.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroText}>
          <Text style={styles.confidence}>
            <Text style={{ color: confidenceColor(favourite.probability) }}>{favourite.probability}%</Text>{' '}
            {favourite.team ? favourite.team.name : t('matchAnalysis.draw')}
          </Text>
          <Text style={styles.confidenceCaption}>
            {favourite.team ? t('matchAnalysis.estimatedWinProbability') : t('matchAnalysis.estimatedDrawProbability')}
          </Text>
          <Text style={styles.question}>{t('matchAnalysis.whyDoesAiThink')}</Text>
        </View>

        {match.factors.map((factor) => (
          <FactorCompareBar key={factor.key} factor={factor} home={match.home} away={match.away} />
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
  confidence: { fontFamily: fonts.headlineBold, fontSize: 32, color: colors.textPrimary },
  confidenceCaption: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textMuted, marginTop: 3 },
  question: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, marginTop: 14 },
});
