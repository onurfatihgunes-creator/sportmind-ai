import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { colors, fonts, radius, spacing } from '@/constants/theme';

const rows = [
  { label: 'Daily analyses', free: '1', premium: 'infinity' },
  { label: 'Advanced explanations', free: false, premium: true },
  { label: 'Historical comparisons', free: false, premium: true },
  { label: 'No ads', free: false, premium: true },
];

export default function PremiumScreen() {
  const [yearly, setYearly] = useState(true);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.primary, '#7C3AED']} style={styles.icon}>
          <Feather name="zap" size={20} color="#fff" />
        </LinearGradient>
        <Text style={styles.title}>Go deeper with AI</Text>
        <Text style={styles.subtitle}>You've reached your daily analysis limit 4 times this week</Text>

        <View style={styles.toggle}>
          <Pressable style={[styles.toggleOption, !yearly && styles.toggleOptionActive]} onPress={() => setYearly(false)}>
            <Text style={!yearly ? styles.toggleTextActive : styles.toggleText}>Monthly</Text>
          </Pressable>
          <Pressable style={[styles.toggleOption, yearly && styles.toggleOptionActive]} onPress={() => setYearly(true)}>
            <Text style={yearly ? styles.toggleTextActive : styles.toggleText}>Yearly · save 30%</Text>
          </Pressable>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderCell} />
            <Text style={[styles.tableHeaderCell, styles.tableHeaderCellCenter]}>Free</Text>
            <Text style={[styles.tableHeaderCell, styles.tableHeaderCellCenter, { color: colors.primaryLight }]}>Premium</Text>
          </View>
          {rows.map((row) => (
            <View key={row.label} style={styles.tableRow}>
              <Text style={styles.tableLabel}>{row.label}</Text>
              <View style={styles.tableCellCenter}>
                {typeof row.free === 'string' ? (
                  <Text style={styles.tableValueMuted}>{row.free}</Text>
                ) : (
                  <Feather name="x" size={13} color={colors.textFaint} />
                )}
              </View>
              <View style={styles.tableCellCenter}>
                {row.premium === 'infinity' ? (
                  <Text style={[styles.tableValueMuted, { color: colors.successText, fontSize: 14 }]}>&#8734;</Text>
                ) : (
                  <Feather name="check" size={14} color={colors.successText} />
                )}
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Start Premium — £{yearly ? '69.99/yr' : '6.99/mo'}</Text>
        </Pressable>
        <Text style={styles.fineprint}>
          {yearly ? 'Billed yearly at £69.99.' : 'Billed monthly at £6.99.'} Auto-renews unless cancelled at least 24h
          before the period ends.
        </Text>

        <View style={styles.linksRow}>
          <Text style={styles.link}>Restore purchases</Text>
          <Text style={styles.link}>Terms</Text>
          <Text style={styles.link}>Privacy</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xxl, paddingBottom: 120, alignItems: 'center' },
  icon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
  title: { fontFamily: fonts.headline, fontSize: 20, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: spacing.xl, lineHeight: 17 },
  toggle: { flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, width: '100%', marginBottom: spacing.xl },
  toggleOption: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm },
  toggleOptionActive: { backgroundColor: colors.primary },
  toggleText: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  toggleTextActive: { fontFamily: fonts.bodyMedium, fontSize: 12, color: '#fff' },
  table: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, marginBottom: spacing.xl },
  tableHeader: { flexDirection: 'row', marginBottom: 8 },
  tableHeaderCell: { flex: 1, fontFamily: fonts.body, fontSize: 10, color: colors.textMuted },
  tableHeaderCellCenter: { textAlign: 'center', flex: 0.5 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  tableLabel: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: '#E5E7EB' },
  tableCellCenter: { flex: 0.5, alignItems: 'center' },
  tableValueMuted: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  cta: { width: '100%', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontFamily: fonts.headline, fontSize: 14, color: '#fff' },
  fineprint: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textFaint, textAlign: 'center', marginTop: 12, marginBottom: 14, lineHeight: 14 },
  linksRow: { flexDirection: 'row', gap: 16 },
  link: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
});
