import { StyleSheet, Text } from 'react-native';
import { colors, disclaimer, fonts } from '@/constants/theme';

export default function Disclaimer({ style }: { style?: object }) {
  return <Text style={[styles.text, style]}>{disclaimer}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 14,
  },
});
