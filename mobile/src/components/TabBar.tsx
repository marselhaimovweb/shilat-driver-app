import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, gradients, shadows } from '../theme';
import { haptic, type IconName } from './Button';
import { Text } from './Text';

export interface TabMeta {
  label: string;
  icon: IconName;
  iconActive: IconName;
  /** rendered as the raised round action in the middle */
  center?: boolean;
}

/** Floating glass-like tab bar with an optional raised centre action. */
export function TabBar({ state, navigation, meta, dark }: BottomTabBarProps & { meta: Record<string, TabMeta>; dark?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={[styles.bar, dark ? styles.barDark : styles.barLight, shadows.lg]}>
        {state.routes.map((route, index) => {
          const m = meta[route.name];
          if (!m) return null;
          const focused = state.index === index;
          const onPress = () => {
            haptic();
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          if (m.center) {
            return (
              <Pressable key={route.key} onPress={onPress} style={styles.centerSlot} accessibilityRole="button" accessibilityLabel={m.label}>
                <View style={[styles.centerBtn, shadows.glow, dark && { borderColor: colors.midnight }]}>
                  <LinearGradient colors={gradients.primary} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                  <MaterialCommunityIcons name={m.icon} size={28} color="#fff" />
                </View>
                <Text variant="caption" color={dark ? colors.onDarkSoft : colors.navy} weight={fonts.semibold}>
                  {m.label}
                </Text>
              </Pressable>
            );
          }
          const tint = focused ? (dark ? colors.aqua : colors.cobalt) : dark ? colors.onDarkMuted : colors.textMuted;
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
              <View style={[styles.iconPill, focused && { backgroundColor: dark ? 'rgba(22,199,242,0.14)' : colors.infoSoft }]}>
                <MaterialCommunityIcons name={focused ? m.iconActive : m.icon} size={23} color={tint} />
              </View>
              <Text variant="caption" color={tint} weight={focused ? fonts.semibold : fonts.medium} numberOfLines={1}>
                {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 26,
    paddingVertical: 8,
    paddingHorizontal: 6,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  barLight: { backgroundColor: 'rgba(255,255,255,0.97)', borderWidth: 1, borderColor: colors.line },
  barDark: { backgroundColor: 'rgba(7,30,51,0.97)', borderWidth: 1, borderColor: colors.glassLine },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  iconPill: { width: 48, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  centerSlot: { flex: 1, alignItems: 'center', gap: 4, marginTop: -30 },
  centerBtn: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.surface },
});
