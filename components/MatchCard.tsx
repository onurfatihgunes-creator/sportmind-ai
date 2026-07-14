import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '@/constants/theme';
import { favouredOutcome, type Match } from '@/data/mockData';
import TeamCrest from './TeamCrest';
import ConfidenceRing from './ConfidenceRing';

export default function MatchCard({ match }: { match: Match }) {
  const { t } = useTranslation();
  const favourite = favouredOutcome(match);

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/match/${match.id}`)}>
      <View style={styles.row}>
        <View style={styles.crests}>
          <TeamCrest team={match.home} size={24} />
          <TeamCrest team={match.away} size={24} overlap />
        </View>
        <ConfidenceRing value={favourite.probability} size={30} strokeWidth={3} />
      </View>
      <Text style={styles.title}>
        {match.home.name} {t('common.vs')} {match.away.name}
      </Text>
      <Text style={styles.subtitle}>{match.kickoff}</Text>
      <Text style={styles.favourite}>
        {favourite.team ? t('matchCard.favoured', { team: favourite.team.name }) : t('matchCard.drawLikely')} ·{' '}
        {favourite.probability}%
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 168,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 13,
    marginRight: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  crests: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.body, fontSize: 9, color: colors.textMuted, marginTop: 3 },
  favourite: { fontFamily: fonts.body, fontSize: 9, color: colors.textSecondary, marginTop: 4 },
});
