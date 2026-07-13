import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polygon, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { teams } from '@/data/mockData';
import TeamCrest from '@/components/TeamCrest';

const AXES = ['Form', 'xG', 'Pressing', 'Possession', 'Defence', 'Home form'];

function axisPoint(index: number, value: number, cx = 50, cy = 50, r = 40) {
  const angle = (Math.PI / 180) * (index * 60 - 90);
  const dist = r * value;
  return `${cx + dist * Math.cos(angle)},${cy + dist * Math.sin(angle)}`;
}

function polygonPoints(values: number[]) {
  return values.map((v, i) => axisPoint(i, v)).join(' ');
}

export default function TeamComparisonScreen() {
  const { a, b } = useLocalSearchParams<{ a?: string; b?: string }>();
  const teamA = teams[a ?? 'liverpool'];
  const teamB = teams[b ?? 'chelsea'];

  const valuesA = [0.9, 0.75, 0.8, 0.6, 0.55, 0.85];
  const valuesB = [0.6, 0.55, 0.5, 0.85, 0.7, 0.45];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>Team comparison</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.teamsRow}>
          <View style={styles.teamCol}>
            <TeamCrest team={teamA} size={38} />
            <Text style={styles.teamName}>{teamA.name}</Text>
          </View>
          <Text style={styles.vs}>vs</Text>
          <View style={styles.teamCol}>
            <TeamCrest team={teamB} size={38} />
            <Text style={styles.teamName}>{teamB.name}</Text>
          </View>
        </View>

        <View style={styles.radarWrap}>
          <Svg width={240} height={240} viewBox="-18 -14 136 128">
            <Polygon
              points={polygonPoints([1, 1, 1, 1, 1, 1])}
              fill="none"
              stroke={colors.border}
              strokeWidth={0.5}
            />
            <Polygon
              points={polygonPoints(valuesA)}
              fill="rgba(99,102,241,0.22)"
              stroke="#6366F1"
              strokeWidth={1.6}
            />
            <Polygon
              points={polygonPoints(valuesB)}
              fill="rgba(34,197,94,0.16)"
              stroke={colors.success}
              strokeWidth={1.6}
            />
            {AXES.map((label, i) => {
              const [x, y] = axisPoint(i, 1.28).split(',').map(Number);
              const anchor = i === 4 || i === 5 ? 'end' : i === 1 || i === 2 ? 'start' : 'middle';
              return (
                <SvgText key={label} x={x} y={y} fontSize={5} fill={colors.textSecondary} textAnchor={anchor}>
                  {label}
                </SvgText>
              );
            })}
          </Svg>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#6366F1' }]} />
            <Text style={styles.legendText}>{teamA.name}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>{teamB.name}</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={[styles.summaryTitle, { color: colors.successText }]}>{teamA.name} strength</Text>
          <Text style={styles.summaryText}>Pressing intensity is 18% higher over the last 6 matches.</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryTitle, { color: colors.warningText }]}>{teamB.name} strength</Text>
          <Text style={styles.summaryText}>Higher average possession share in home fixtures this season.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  content: { paddingHorizontal: spacing.xl, paddingBottom: 60, alignItems: 'center' },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: spacing.md },
  teamCol: { alignItems: 'center' },
  teamName: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.textPrimary, marginTop: 5 },
  vs: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  radarWrap: { marginVertical: spacing.sm },
  legendRow: { flexDirection: 'row', gap: 18, marginBottom: spacing.xl },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary },
  summaryCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.md, padding: 13, marginBottom: spacing.sm },
  summaryTitle: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, marginBottom: 3 },
  summaryText: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
});
