import { useTranslation } from 'react-i18next';
import { StyleProp, Text, TextStyle } from 'react-native';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/contexts/ThemeContext';

export default function Disclaimer({ style }: { style?: StyleProp<TextStyle> }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
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
