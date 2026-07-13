import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { teams } from '@/data/mockData';
import TeamCrest from '@/components/TeamCrest';

const clubs = [teams.arsenal, teams.liverpool, teams.barcelona, teams.chelsea];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(['arsenal', 'barcelona']);

  const next = () => {
    if (step < 3) setStep(step + 1);
    else router.replace('/(tabs)');
  };

  const toggleClub = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.body}>
        {step === 0 && (
          <View style={styles.centerContent}>
            <LinearGradient colors={[colors.primary, '#7C3AED']} style={styles.iconCircle}>
              <Feather name="cpu" size={22} color="#fff" />
            </LinearGradient>
            <Text style={styles.title}>AI that shows its work</Text>
            <Text style={styles.subtitle}>
              Thousands of signals go in. A clear, explainable analysis comes out — no black box.
            </Text>
          </View>
        )}
        {step === 1 && (
          <View style={styles.centerContent}>
            <LinearGradient colors={[colors.warning, colors.primary]} style={styles.iconCircle}>
              <Feather name="trending-up" size={22} color="#fff" />
            </LinearGradient>
            <Text style={styles.title}>Confidence, not certainty</Text>
            <Text style={styles.subtitle}>
              Football stays unpredictable. Our numbers show likelihood, never a guarantee.
            </Text>
          </View>
        )}
        {step === 2 && (
          <View style={styles.centerContent}>
            <LinearGradient colors={[colors.primary, '#7C3AED']} style={styles.iconCircle}>
              <Feather name="shield" size={22} color="#fff" />
            </LinearGradient>
            <Text style={styles.title}>Analysis, not advice</Text>
            <View style={styles.bulletList}>
              <Text style={styles.bullet}>•  AI-generated analysis only</Text>
              <Text style={styles.bullet}>•  No outcome is guaranteed</Text>
              <Text style={styles.bullet}>•  You make your own decisions</Text>
            </View>
          </View>
        )}
        {step === 3 && (
          <View style={styles.step4}>
            <Text style={styles.title}>Pick your clubs</Text>
            <Text style={[styles.subtitle, { marginBottom: spacing.xl }]}>We'll personalize your feed</Text>
            <View style={styles.clubGrid}>
              {clubs.map((club) => {
                const active = selected.includes(club.id);
                return (
                  <Pressable
                    key={club.id}
                    style={[styles.clubChip, active && styles.clubChipActive]}
                    onPress={() => toggleClub(club.id)}
                  >
                    <TeamCrest team={club} size={18} />
                    <Text style={active ? styles.clubNameActive : styles.clubName}>{club.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.notifyRow}>
              <Feather name="bell" size={14} color={colors.primaryLight} />
              <Text style={styles.notifyText}>Get notified on key changes</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        <Pressable style={styles.cta} onPress={next}>
          <Text style={styles.ctaText}>{step === 2 ? 'I understand' : step === 3 ? 'Get started' : 'Next'}</Text>
        </Pressable>
        {step < 2 && (
          <Pressable onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl },
  centerContent: { alignItems: 'center' },
  step4: { width: '100%' },
  iconCircle: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  title: { fontFamily: fonts.headline, fontSize: 18, color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  bulletList: { marginTop: spacing.md, alignSelf: 'stretch' },
  bullet: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
  clubGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  clubChip: { flexBasis: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10, borderWidth: 1, borderColor: 'transparent' },
  clubChipActive: { borderColor: colors.primary },
  clubName: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted },
  clubNameActive: { fontFamily: fonts.body, fontSize: 11.5, color: '#E5E7EB' },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 12, marginTop: spacing.lg },
  notifyText: { fontFamily: fonts.body, fontSize: 11.5, color: '#E5E7EB' },
  footer: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginBottom: spacing.lg },
  dot: { width: 7, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.primary },
  cta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  ctaText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: '#fff' },
  skip: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 10 },
});
