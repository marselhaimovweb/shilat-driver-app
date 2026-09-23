import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { colors, type as typography } from '../theme';

type Variant = keyof typeof typography;

export interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontFamily'];
}

export function Text({ variant = 'body', color = colors.text, align, weight, style, ...rest }: AppTextProps) {
  return (
    <RNText
      {...rest}
      style={[typography[variant], { color, writingDirection: 'rtl' }, align && { textAlign: align }, weight && { fontFamily: weight }, style]}
    />
  );
}
