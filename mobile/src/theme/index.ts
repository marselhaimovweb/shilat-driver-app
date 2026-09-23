import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/*
 * "Deep Water" design language
 * Midnight navy surfaces for depth, electric aqua for action, foam-white cards.
 * One accent family (aqua -> cobalt) keeps the brand recognisable; status
 * colours are reserved for meaning only.
 */
export const colors = {
  ink: '#04121F',
  midnight: '#071E33',
  navy: '#0B2C4B',
  ocean: '#0F4C81',
  cobalt: '#1668E3',
  aqua: '#16C7F2',
  aquaSoft: '#7BE3FA',
  foam: '#E9F8FD',
  mist: '#F3F7FA',
  surface: '#FFFFFF',
  line: '#E3EAF0',
  lineStrong: '#CBD6E0',

  text: '#0A1B2C',
  textSoft: '#4E5F71',
  textMuted: '#8A9AAB',
  onDark: '#FFFFFF',
  onDarkSoft: 'rgba(255,255,255,0.72)',
  onDarkMuted: 'rgba(255,255,255,0.48)',
  glass: 'rgba(255,255,255,0.10)',
  glassStrong: 'rgba(255,255,255,0.16)',
  glassLine: 'rgba(255,255,255,0.14)',

  success: '#12B886',
  successSoft: '#E3F8F1',
  warning: '#F59F00',
  warningSoft: '#FFF4DB',
  danger: '#E8455F',
  dangerSoft: '#FDE8EC',
  info: '#1668E3',
  infoSoft: '#E6F0FD',
  gold: '#FFC93C',
};

export const gradients = {
  primary: ['#19D3F7', '#1668E3'] as const,
  deep: ['#0B2C4B', '#04121F'] as const,
  hero: ['#0F4C81', '#071E33', '#04121F'] as const,
  aqua: ['#7BE3FA', '#16C7F2'] as const,
  gold: ['#FFE08A', '#FFB020'] as const,
  success: ['#34D399', '#0CA678'] as const,
  danger: ['#FF7A8A', '#E8455F'] as const,
};

export const fonts = {
  regular: 'Rubik_400Regular',
  medium: 'Rubik_500Medium',
  semibold: 'Rubik_600SemiBold',
  bold: 'Rubik_700Bold',
  black: 'Rubik_800ExtraBold',
};

export const radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 44 };

export const type = {
  display: { fontFamily: fonts.black, fontSize: 34, lineHeight: 40, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
  number: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
} satisfies Record<string, TextStyle>;

function shadow(elevation: number, color = '#0B2C4B', opacity = 0.1): ViewStyle {
  return Platform.select({
    web: { boxShadow: `0 ${elevation}px ${elevation * 3}px rgba(11,44,75,${opacity})` } as ViewStyle,
    default: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: elevation * 1.6,
      shadowOffset: { width: 0, height: elevation * 0.6 },
      elevation: Math.round(elevation / 2),
    },
  })!;
}

export const shadows = {
  sm: shadow(4, '#0B2C4B', 0.06),
  md: shadow(10, '#0B2C4B', 0.09),
  lg: shadow(18, '#0B2C4B', 0.14),
  glow: shadow(14, '#1668E3', 0.35),
};
