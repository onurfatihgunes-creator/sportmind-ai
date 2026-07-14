import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fonts } from '@/constants/theme';

export default function Disclaimer({ style }: { style?: object }) {
  const { t } = useTranslation();
  return <Text style={[styles.text, style]}>{t('disclaimer.full')}</Text>;
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
