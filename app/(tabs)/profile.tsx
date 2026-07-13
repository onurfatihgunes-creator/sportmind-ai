import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, fonts, radius, spacing } from '@/constants/theme';

const groupOne = [
  { icon: 'bookmark', label: 'Saved analyses' },
  { icon: 'clock', label: 'Reading history' },
  { icon: 'heart', label: 'Favourite clubs and leagues' },
] as const;

const groupTwo = [
  { icon: 'award', label: 'Subscription', onPress: () => router.push('/(tabs)/premium') },
  { icon: 'shield', label: 'Legal and methodology', onPress: () => router.push('/legal') },
  { icon: 'download', label: 'Export my data' },
] as const;

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarWrap}>
          <LinearGradient colors={[colors.primary, '#7C3AED']} style={styles.avatar}>
            <Text style={styles.avatarText}>O</Text>
          </LinearGradient>
          <Text style={styles.name}>Onur</Text>
          <Text style={styles.membership}>Premium member</Text>
        </View>

        <Group items={groupOne} />
        <Group items={groupTwo} />

        <Pressable style={styles.deleteRow}>
          <Feather name="trash-2" size={14} color={colors.dangerText} />
          <Text style={styles.deleteText}>Delete account</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ items }: { items: readonly { icon: any; label: string; onPress?: () => void }[] }) {
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
  name: { fontFamily: fonts.headline, fontSize: 15, color: colors.textPrimary },
  membership: { fontFamily: fonts.body, fontSize: 10.5, color: colors.successText, marginTop: 3 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden' },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  groupRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  groupRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupLabel: { fontFamily: fonts.body, fontSize: 12.5, color: '#E5E7EB' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 13 },
  deleteText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.dangerText },
});
