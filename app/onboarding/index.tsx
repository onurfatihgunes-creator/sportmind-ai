import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { teams } from '@/data/mockData';
import TeamCrest from '@/components/TeamCrest';

const clubs = [teams.arsenal, teams.liverpool, teams.barcelona, teams.chelsea];

export default function OnboardingScreen() {
  const { t } = useTranslation();
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
            <Text style={styles.title}>{t('onboarding.step1Title')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.step1Body')}</Text>
          </View>
        )}
        {step === 1 && (
          <View style={styles.centerContent}>
            <LinearGradient colors={[colors.warning, colors.primary]} style={styles.iconCircle}>
              <Feather name="trending-up" size={22} color="#fff" />
            </LinearGradient>
            <Text style={styles.title}>{t('onboarding.step2Title')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.step2Body')}</Text>
          </View>
        )}
        {step === 2 && (
          <View style={styles.centerContent}>
            <LinearGradient colors={[colors.primary, '#7C3AED']} style={styles.iconCircle}>
              <Feather name="shield" size={22} color="#fff" />
            </LinearGradient>
            <Text style={styles.title}>{t('onboarding.step3Title')}</Text>
            <View style={styles.bulletList}>
              <Text style={styles.bullet}>•  {t('onboarding.bullet1')}</Text>
              <Text style={styles.bullet}>•  {t('onboarding.bullet2')}</Text>
              <Text style={styles.bullet}>•  {t('onboarding.bullet3')}</Text>
            </View>
          </View>
        )}
        {step === 3 && (
          <View style={styles.step4}>
            <Text style={styles.title}>{t('onboarding.step4Title')}</Text>
            <Text style={[styles.subtitle, { marginBottom: spacing.xl }]}>{t('onboarding.step4Subtitle')}</Text>
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
              <Text style={styles.notifyText}>{t('onboarding.getNotified')}</Text>
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
          <Text style={styles.ctaText}>
            {step === 2 ? t('onboarding.iUnderstand') : step === 3 ? t('onboarding.getStarted') : t('common.next')}
          </Text>
        </Pressable>
        {step < 2 && (
          <Pressable onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.skip}>{t('common.skip')}</Text>
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
  clubChip: { flexBasis: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, padding: 11, borderWidth: 1, borderColor: colors.border },
  clubChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  clubName: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.textMuted },
  clubNameActive: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.primaryLight },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginTop: spacing.lg },
  notifyText: { fontFamily: fonts.body, fontSize: 11.5, color: '#E5E7EB' },
  footer: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginBottom: spacing.lg },
  dot: { width: 7, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.primary },
  cta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  ctaText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: '#fff' },
  skip: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 10 },
});
