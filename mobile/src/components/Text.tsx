import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { useA11y } from '../state/accessibility';
import { colors, type as typography } from '../theme';

type Variant = keyof typeof typography;

export interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  align?: TextStyle['textAlign'];
  weight?: TextStyle['fontFamily'];
}

/** Secondary text colors are darkened in high-contrast mode (WCAG AA contrast). */
const HIGH_CONTRAST: Record<string, string> = {
  [colors.textSoft]: colors.text,
  [colors.textMuted]: colors.text,
  [colors.onDarkSoft]: colors.onDark,
  [colors.onDarkMuted]: colors.onDark,
};

export function Text({ variant = 'body', color = colors.text, align, weight, style, ...rest }: AppTextProps) {
  const { textScale, highContrast } = useA11y();
  const base = typography[variant];
  const size = textScale === 1 ? base : { ...base, fontSize: base.fontSize * textScale, lineHeight: base.lineHeight * textScale };
  return (
    <RNText
      maxFontSizeMultiplier={2}
      {...rest}
      style={[
        size,
        { color: highContrast ? (HIGH_CONTRAST[color] ?? color) : color, writingDirection: 'rtl' },
        align && { textAlign: align },
        weight && { fontFamily: weight },
        style,
      ]}
    />
  );
}
