import { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../theme';

// kept near the edges so they never sit on top of headlines
const BUBBLES = [
  { x: 0.04, y: 0.2, r: 30 },
  { x: 0.13, y: 0.55, r: 9 },
  { x: 0.24, y: 0.1, r: 5 },
  { x: 0.08, y: 0.86, r: 14 },
  { x: 0.97, y: 0.9, r: 20 },
  { x: 0.9, y: 0.66, r: 6 },
  { x: 0.42, y: 0.04, r: 4 },
  { x: 0.33, y: 0.93, r: 7 },
];

/** Soap bubbles with a glossy highlight - decorative layer for dark hero areas. */
export const Bubbles = memo(function Bubbles({
  width,
  height,
  opacity = 1,
  seed = 0,
}: {
  width: number;
  height: number;
  opacity?: number;
  seed?: number;
}) {
  return (
    <Svg width={width} height={height} style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      <Defs>
        <RadialGradient id="bubble" cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="0.35" stopColor="#BFF3FF" stopOpacity="0.12" />
          <Stop offset="0.85" stopColor="#7BE3FA" stopOpacity="0.05" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0.35" />
        </RadialGradient>
      </Defs>
      {BUBBLES.map((b, i) => {
        const x = ((b.x + seed * 0.13 * (i % 2 ? 1 : -1) + 1) % 1) * width;
        const y = b.y * height;
        return <BubbleShape key={i} x={x} y={y} r={b.r} />;
      })}
    </Svg>
  );
});

function BubbleShape({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <Circle cx={x} cy={y} r={r} fill="url(#bubble)" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
      <Circle cx={x - r * 0.35} cy={y - r * 0.4} r={Math.max(1.5, r * 0.18)} fill="rgba(255,255,255,0.85)" />
    </>
  );
}

/** Wave edge used at the bottom of hero headers. Fill should match the page background. */
export function Wave({ color = colors.mist, height = 36, style }: { color?: string; height?: number; style?: ViewStyle }) {
  return (
    <View style={[{ height, width: '100%' }, style]} pointerEvents="none">
      <Svg width="100%" height={height} viewBox="0 0 400 40" preserveAspectRatio="none">
        <Path d="M0,22 C60,4 120,4 190,20 C260,36 330,38 400,16 L400,40 L0,40 Z" fill={colors.aqua} opacity={0.22} />
        <Path d="M0,30 C80,12 150,16 220,28 C290,40 350,34 400,24 L400,40 L0,40 Z" fill={color} />
      </Svg>
    </View>
  );
}

/** Tiny sparkle glyph used next to "clean" moments. */
export function Sparkle({ size = 14, color = colors.aquaSoft }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0 Z" fill={color} />
    </Svg>
  );
}
