import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, fonts, radius, spacing } from '@/constants/theme';

type LegalLink = { icon: keyof typeof Feather.glyphMap; label: string; onPress?: () => void };

const links: LegalLink[] = [
  { icon: 'file-text', label: 'Privacy policy' },
  { icon: 'file', label: 'Terms of service' },
  { icon: 'alert-circle', label: 'Disclaimer' },
  { icon: 'shield', label: 'Responsible AI' },
  { icon: 'heart', label: 'Responsible use' },
  { icon: 'cpu', label: 'Methodology', onPress: () => router.push('/legal/methodology') },
  { icon: 'code', label: 'Licences and open source' },
  { icon: 'database', label: 'Data sources' },
];

export default function LegalHubScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>Legal and transparency</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.group}>
          {links.map((link, index) => (
            <Pressable
              key={link.label}
              onPress={link.onPress ?? (() => {})}
              style={[styles.row, index < links.length - 1 && styles.rowBorder]}
            >
              <View style={styles.rowLeft}>
                <Feather name={link.icon} size={15} color={colors.textSecondary} />
                <Text style={styles.label}>{link.label}</Text>
              </View>
              <Feather name="chevron-right" size={14} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.headline, fontSize: 14, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60 },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: fonts.body, fontSize: 12.5, color: '#E5E7EB' },
});
