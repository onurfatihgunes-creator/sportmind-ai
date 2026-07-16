import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, confidenceColor, fonts, radius } from '@/constants/theme';
import { favouredOutcome, type Match } from '@/data/mockData';
import TeamCrest from './TeamCrest';
import ConfidenceRing from './ConfidenceRing';

export default function MatchCard({ match }: { match: Match }) {
  const { t } = useTranslation();
  const favourite = favouredOutcome(match);

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/match/${match.id}`)}>
      <View style={styles.competitionChip}>
        <Text style={styles.competitionChipText} numberOfLines={1}>
          {match.competition}
        </Text>
      </View>
      <View style={styles.row}>
        <View style={styles.crests}>
          <TeamCrest team={match.home} size={26} />
          <TeamCrest team={match.away} size={26} overlap />
        </View>
        <ConfidenceRing value={favourite.probability} size={34} strokeWidth={3.5} />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {match.home.name} {t('common.vs')} {match.away.name}
      </Text>
      <Text style={styles.subtitle}>{match.kickoff}</Text>
      <Text style={styles.favourite}>
        {favourite.team ? t('matchCard.favoured', { team: favourite.team.name }) : t('matchCard.drawLikely')} ·{' '}
        <Text style={{ color: confidenceColor(favourite.probability), fontFamily: fonts.bodySemiBold }}>
          {favourite.probability}%
        </Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 180,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginRight: 12,
  },
  competitionChip: { alignSelf: 'flex-start', marginBottom: 10 },
  competitionChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    color: colors.primaryLight,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  crests: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textPrimary, lineHeight: 16 },
  subtitle: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textMuted, marginTop: 4 },
  favourite: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textSecondary, marginTop: 6 },
});
