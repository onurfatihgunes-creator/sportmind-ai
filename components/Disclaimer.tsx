import { useTranslation } from 'react-i18next';
import { StyleProp, Text, TextStyle } from 'react-native';
import { colors, fonts } from '@/constants/theme';

export default function Disclaimer({ style }: { style?: StyleProp<TextStyle> }) {
  const { t } = useTranslation();
  return (
    <Text
      style={[
        { fontFamily: fonts.body, fontSize: 11, lineHeight: 17, color: colors.textFainter, textAlign: 'center', marginTop: 16, marginHorizontal: 26 },
        style,
      ]}
    >
      {t('disclaimer.full')}
    </Text>
  );
}
