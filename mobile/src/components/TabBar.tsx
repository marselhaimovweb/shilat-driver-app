import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
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
  /** opens another part of the app instead of switching tab */
  href?: Href;
  /** small number bubble (e.g. items in the cart) */
  badge?: number;
}

/** Floating glass-like tab bar with an optional raised centre action. */
export function TabBar({ state, navigation, meta, dark }: BottomTabBarProps & { meta: Record<string, TabMeta>; dark?: boolean }) {
  const insets = useSafeAreaInsets();
  const visible = state.routes.filter((r) => meta[r.name]).length;
  // the raised centre button only looks centred when the number of tabs is odd
  const raiseCenter = visible % 2 === 1;
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={[styles.bar, dark ? styles.barDark : styles.barLight, shadows.lg]}>
        {state.routes.map((route, index) => {
          const m = meta[route.name];
          if (!m) return null;
          const focused = state.index === index;
          const onPress = () => {
            haptic();
            if (m.href) return router.push(m.href);
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          if (m.center && raiseCenter) {
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
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityLabel={m.badge ? `${m.label}, ${m.badge} פריטים` : m.label}
              accessibilityState={{ selected: focused }}
            >
              <View
                style={[
                  styles.iconPill,
                  focused && { backgroundColor: dark ? 'rgba(22,199,242,0.14)' : colors.infoSoft },
                  m.center && { overflow: 'hidden' },
                ]}
              >
                {m.center && <LinearGradient colors={gradients.primary} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />}
                <MaterialCommunityIcons name={focused ? m.iconActive : m.icon} size={23} color={m.center ? '#fff' : tint} />
                {!!m.badge && (
                  <View style={styles.badge}>
                    <Text variant="caption" color="#fff" style={{ fontSize: 10, lineHeight: 13 }}>
                      {m.badge > 9 ? '9+' : m.badge}
                    </Text>
                  </View>
                )}
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
  badge: {
    position: 'absolute',
    top: -4,
    left: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: { flex: 1, alignItems: 'center', gap: 4, marginTop: -30 },
  centerBtn: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: colors.surface },
});
