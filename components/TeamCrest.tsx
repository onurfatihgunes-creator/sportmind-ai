import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '@/constants/theme';
import type { Team } from '@/data/mockData';

export default function TeamCrest({
  team,
  size = 32,
  overlap = false,
}: {
  team: Team;
  size?: number;
  overlap?: boolean;
}) {
  return (
    <View
      style={[
        styles.crest,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: team.bg,
          marginLeft: overlap ? -size * 0.3 : 0,
        },
      ]}
    >
      <Text style={[styles.code, { color: team.fg, fontSize: size * 0.32 }]}>{team.code}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  crest: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#15151C',
  },
  code: {
    fontFamily: fonts.bodySemiBold,
  },
});
