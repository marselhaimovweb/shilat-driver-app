import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Stylised side profile of a freshly washed car, facing the reading
 * direction (left in Hebrew). Pure vector so it stays crisp on any screen.
 */
export function CarArt({ width = 300, variant = 'light' }: { width?: number; variant?: 'light' | 'dark' }) {
  const height = (width * 128) / 320;
  const body = variant === 'light' ? ['#FFFFFF', '#CFEFFB'] : ['#1A4F80', '#0B2C4B'];
  const glass = variant === 'light' ? ['#0F4C81', '#071E33'] : ['#7BE3FA', '#16C7F2'];
  return (
    <Svg width={width} height={height} viewBox="0 0 320 128">
      <Defs>
        <LinearGradient id="carBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={body[0]} />
          <Stop offset="1" stopColor={body[1]} />
        </LinearGradient>
        <LinearGradient id="carGlass" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={glass[0]} />
          <Stop offset="1" stopColor={glass[1]} />
        </LinearGradient>
        <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* ground shadow */}
      <Ellipse cx="162" cy="112" rx="140" ry="7" fill="#000" opacity={0.25} />

      {/* body */}
      <Path
        d="M20,84 C20,70 27,63 44,60 L96,53 C112,36 132,26 164,24 L210,24 C232,24 248,36 262,50 L292,56 C304,58 308,67 308,78 L308,90 C308,95 305,98 300,98 L28,98 C23,98 20,94 20,90 Z"
        fill="url(#carBody)"
      />
      {/* windows */}
      <Path d="M108,53 C120,40 136,32 160,31 L172,31 L172,53 Z" fill="url(#carGlass)" />
      <Path d="M180,31 L206,31 C222,31 236,40 248,53 L180,53 Z" fill="url(#carGlass)" />
      {/* body crease + door line */}
      <Path d="M44,70 L300,70" stroke={variant === 'light' ? '#9FDDF3' : '#2B6CA3'} strokeWidth={1.5} />
      <Path d="M176,56 L176,94" stroke={variant === 'light' ? '#B9E7F7' : '#2B6CA3'} strokeWidth={1.2} />
      {/* headlight + tail light */}
      <Path d="M22,74 C26,68 34,66 42,66 L40,74 Z" fill={colors.aquaSoft} />
      <Path d="M300,66 L308,68 L308,76 L298,74 Z" fill="#FF6B81" />
      {/* reflection streak */}
      <Path d="M70,62 L250,58" stroke="url(#shine)" strokeWidth={3} strokeLinecap="round" />

      {/* wheels */}
      {[82, 252].map((cx) => (
        <G key={cx}>
          <Circle cx={cx} cy={98} r={21} fill="#04121F" />
          <Circle cx={cx} cy={98} r={13} fill="#C9D6E2" />
          <Circle cx={cx} cy={98} r={9} fill="#8A9AAB" />
          <Circle cx={cx} cy={98} r={3} fill="#E9F8FD" />
        </G>
      ))}

      {/* water droplets falling off the roof */}
      <Path d="M150,6 C152,10 154,12 154,14 A4,4 0 0 1 146,14 C146,12 148,10 150,6 Z" fill={colors.aquaSoft} />
      <Path d="M198,2 C200,6 202,8 202,10 A4,4 0 0 1 194,10 C194,8 196,6 198,2 Z" fill={colors.aqua} opacity={0.8} />
      <Path d="M232,12 C233.5,15 235,16.5 235,18 A3,3 0 0 1 229,18 C229,16.5 230.5,15 232,12 Z" fill={colors.aquaSoft} opacity={0.9} />
    </Svg>
  );
}
