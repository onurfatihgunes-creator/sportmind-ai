import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts, PREMIUM_ENABLED, radius, spacing } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { name, setName } = useProfile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const saveName = () => {
    setName(draft);
    setEditing(false);
  };

  const groupOne = [
    { icon: 'bookmark' as const, label: t('profile.savedAnalyses') },
    { icon: 'clock' as const, label: t('profile.readingHistory') },
    { icon: 'heart' as const, label: t('profile.favouriteClubs') },
  ];

  const groupTwo = [
    ...(PREMIUM_ENABLED
      ? [{ icon: 'award' as const, label: t('profile.subscription'), onPress: () => router.push('/(tabs)/premium') }]
      : []),
    { icon: 'shield' as const, label: t('profile.legalAndMethodology'), onPress: () => router.push('/legal') },
    { icon: 'globe' as const, label: t('profile.language'), onPress: () => router.push('/language') },
    { icon: 'download' as const, label: t('profile.exportData') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarWrap}>
          <LinearGradient colors={[colors.primary, '#7C3AED']} style={styles.avatar}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
          {editing ? (
            <TextInput
              style={styles.nameInput}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={saveName}
              onBlur={saveName}
              autoFocus
              maxLength={24}
              placeholder={t('profile.namePlaceholder')}
              placeholderTextColor={colors.textFaint}
            />
          ) : (
            <Pressable style={styles.nameRow} onPress={() => { setDraft(name); setEditing(true); }}>
              <Text style={styles.name}>{name}</Text>
              <Feather name="edit-2" size={12} color={colors.textFaint} />
            </Pressable>
          )}
          {PREMIUM_ENABLED && <Text style={styles.membership}>{t('profile.premiumMember')}</Text>}
        </View>

        <Group items={groupOne} />
        <Group items={groupTwo} />

        <Pressable style={styles.deleteRow}>
          <Feather name="trash-2" size={14} color={colors.dangerText} />
          <Text style={styles.deleteText}>{t('profile.deleteAccount')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ items }: { items: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress?: () => void }[] }) {
  return (
    <View style={styles.group}>
      {items.map((item, index) => (
        <Pressable
          key={item.label}
          onPress={item.onPress}
          style={[styles.groupRow, index < items.length - 1 && styles.groupRowBorder]}
        >
          <View style={styles.groupRowLeft}>
            <Feather name={item.icon} size={15} color={colors.textSecondary} />
            <Text style={styles.groupLabel}>{item.label}</Text>
          </View>
          <Feather name="chevron-right" size={14} color={colors.textFaint} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  avatarWrap: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xxl },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  avatarText: { fontFamily: fonts.headline, fontSize: 18, color: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: fonts.headline, fontSize: 15, color: colors.textPrimary },
  nameInput: {
    fontFamily: fonts.headline,
    fontSize: 15,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
    minWidth: 120,
    textAlign: 'center',
  },
  membership: { fontFamily: fonts.body, fontSize: 10.5, color: colors.successText, marginTop: 3 },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  groupRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  groupRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupLabel: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: '#E5E7EB' },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  deleteText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.dangerText },
});
