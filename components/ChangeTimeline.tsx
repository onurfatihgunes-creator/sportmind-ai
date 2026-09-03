import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ClockCounterClockwiseIcon, type Icon } from 'phosphor-react-native';
import { colors, fonts, toneColor, toneMutedColor, toneTextColor } from '@/constants/theme';
import type { ChangeEvent } from '@/data/mockData';

type Props = { events: ChangeEvent[]; ArrowIcon: Icon; emptyText: string };

export default function ChangeTimeline({ events, ArrowIcon, emptyText }: Props) {
  const { t } = useTranslation();

  if (events.length === 0) {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconCircle}>
          <ClockCounterClockwiseIcon size={20} weight="bold" color={colors.primary} />
        </View>
        <Text style={styles.empty}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingLeft: 20 }}>
      <View style={styles.spine} />
      {events.map((event, index) => {
        const delta = event.to - event.from;
        return (
          <View key={event.id} style={[styles.row, index < events.length - 1 && { paddingBottom: 18 }]}>
            <View style={[styles.dot, { backgroundColor: toneColor(event.tone), shadowColor: toneMutedColor(event.tone) }]} />
            <Text style={styles.timestamp}>{event.timestamp}</Text>
            <Text style={styles.title}>{t(`changeEvents.${event.key}`)}</Text>
            <View style={styles.deltaRow}>
              <Text style={styles.deltaValue}>{event.from}%</Text>
              <ArrowIcon size={11} color={colors.textFaint} weight="bold" />
              <Text style={[styles.deltaValue, { color: toneTextColor(event.tone) }]}>{event.to}%</Text>
              <View style={[styles.chip, { backgroundColor: toneMutedColor(event.tone) }]}>
                <Text style={[styles.chipText, { color: toneTextColor(event.tone) }]}>
                  {delta > 0 ? '+' : ''}
                  {delta}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  spine: { position: 'absolute', left: 4, top: 6, bottom: 16, width: 1, backgroundColor: colors.borderAccent },
  row: { position: 'relative' },
  dot: { position: 'absolute', left: -20, top: 4, width: 9, height: 9, borderRadius: 5, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  timestamp: { fontFamily: fonts.body, fontSize: 11, color: colors.textFainter, marginBottom: 3 },
  title: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary, marginBottom: 6 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  deltaValue: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint },
  chip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 20 },
  emptyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
    marginBottom: 10,
  },
  empty: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center' },
});
