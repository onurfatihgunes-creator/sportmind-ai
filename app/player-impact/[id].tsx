import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import Disclaimer from '@/components/Disclaimer';

const stats = [
  { labelKey: 'expectedGoals', withValue: 70, withoutValue: 38, delta: '-0.6', tone: colors.dangerText },
  { labelKey: 'chanceCreation', withValue: 78, withoutValue: 53, delta: '-32%', tone: colors.dangerText },
  { labelKey: 'pressingEfficiency', withValue: 64, withoutValue: 57, delta: '-11%', tone: colors.warningText },
] as const;

export default function PlayerImpactScreen() {
  const { t } = useTranslation();
  const [withoutPlayer, setWithoutPlayer] = useState(true);
  const playerName = 'Saka';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('playerImpact.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>BS</Text>
        </View>
        <Text style={styles.name}>Bukayo Saka</Text>
        <Text style={styles.role}>Forward · Arsenal</Text>

        <View style={styles.toggle}>
          <Pressable style={[styles.toggleOption, !withoutPlayer && styles.toggleOptionActive]} onPress={() => setWithoutPlayer(false)}>
            <Text style={!withoutPlayer ? styles.toggleTextActive : styles.toggleText}>
              {t('playerImpact.withPlayer', { name: playerName })}
            </Text>
          </Pressable>
          <Pressable style={[styles.toggleOption, withoutPlayer && styles.toggleOptionActive]} onPress={() => setWithoutPlayer(true)}>
            <Text style={withoutPlayer ? styles.toggleTextActive : styles.toggleText}>
              {t('playerImpact.withoutPlayer', { name: playerName })}
            </Text>
          </Pressable>
        </View>

        {stats.map((s) => (
          <View key={s.labelKey} style={styles.statRow}>
            <View style={styles.statLabelRow}>
              <Text style={styles.statLabel}>{t(`playerImpact.${s.labelKey}`)}</Text>
              <Text style={[styles.statDelta, { color: s.tone }]}>{withoutPlayer ? s.delta : '—'}</Text>
            </View>
            <View style={styles.statTracks}>
              <View style={styles.statTrack}>
                <View style={[styles.statFill, { width: `${s.withValue}%`, backgroundColor: '#3f3f46' }]} />
              </View>
              <View style={styles.statTrack}>
                <View
                  style={[
                    styles.statFill,
                    {
                      width: `${withoutPlayer ? s.withoutValue : s.withValue}%`,
                      backgroundColor: withoutPlayer ? colors.danger : colors.success,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        ))}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>{t('playerImpact.summary', { name: playerName, team: 'Arsenal' })}</Text>
        </View>

        <Disclaimer style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1E1B4B', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { fontFamily: fonts.headline, fontSize: 16, color: colors.primaryLight },
  name: { fontFamily: fonts.headline, fontSize: 15, color: colors.textPrimary },
  role: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  toggle: { flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, width: '100%', marginBottom: spacing.xl },
  toggleOption: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  toggleOptionActive: { backgroundColor: colors.primary },
  toggleText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  toggleTextActive: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: '#fff' },
  statRow: { width: '100%', marginBottom: spacing.md },
  statLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: '#E5E7EB' },
  statDelta: { fontFamily: fonts.bodySemiBold, fontSize: 11 },
  statTracks: { flexDirection: 'row', gap: 4 },
  statTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  statFill: { height: '100%', borderRadius: 4 },
  summaryCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.md, padding: 13, marginTop: spacing.sm },
  summaryText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, lineHeight: 17 },
});
