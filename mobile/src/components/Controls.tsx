import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, fonts, gradients, radius, shadows } from '../theme';
import { useA11y } from '../state/accessibility';
import { haptic, type IconName } from './Button';
import { Text } from './Text';

/* ---------- Chip ---------- */

export function Chip({
  label,
  selected,
  onPress,
  icon,
  tone = 'light',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={[
        styles.chip,
        dark
          ? { backgroundColor: selected ? colors.onDark : colors.glass, borderColor: selected ? colors.onDark : colors.glassLine }
          : { backgroundColor: selected ? colors.navy : colors.surface, borderColor: selected ? colors.navy : colors.line },
      ]}
    >
      {icon && <MaterialCommunityIcons name={icon} size={16} color={selected ? (dark ? colors.navy : colors.onDark) : dark ? colors.onDarkSoft : colors.textSoft} />}
      <Text variant="small" weight={fonts.medium} color={selected ? (dark ? colors.navy : colors.onDark) : dark ? colors.onDarkSoft : colors.textSoft}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingHorizontal: 20 }, style]}>
      {children}
    </ScrollView>
  );
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tone = 'light',
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <View style={[styles.segmented, { backgroundColor: dark ? colors.glass : '#E8EEF3' }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptic();
              onChange(o.value);
            }}
            style={[styles.segment, active && [{ backgroundColor: dark ? colors.onDark : colors.surface }, shadows.sm]]}
          >
            {o.icon && <MaterialCommunityIcons name={o.icon} size={16} color={active ? colors.navy : dark ? colors.onDarkSoft : colors.textSoft} />}
            <Text variant="small" weight={active ? fonts.semibold : fonts.medium} color={active ? colors.navy : dark ? colors.onDarkSoft : colors.textSoft}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- On/off switch ---------- */

export function Toggle({ value, onChange, disabled, label }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const { reduceMotion } = useA11y();
  useEffect(() => {
    if (reduceMotion) anim.setValue(value ? 1 : 0);
    else Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, friction: 7, tension: 90 }).start();
  }, [value, anim, reduceMotion]);
  // RTL: the knob rests on the start side (right) and slides left when on
  const translate = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => {
        haptic();
        onChange(!value);
      }}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <View style={[styles.track, { backgroundColor: value ? 'transparent' : colors.lineStrong }]}>
        {value && <LinearGradient colors={gradients.primary} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />}
        <Animated.View style={[styles.knob, { transform: [{ translateX: translate }] }]} />
      </View>
    </Pressable>
  );
}

/* ---------- Text field ---------- */

export function Field({
  label,
  icon,
  error,
  hint,
  style,
  ...input
}: TextInputProps & { label?: string; icon?: IconName; error?: string | null; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 6 }, style as ViewStyle]}>
      {label && (
        <Text variant="small" weight={fonts.medium} color={colors.textSoft}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.field,
          { borderColor: error ? colors.danger : focused ? colors.cobalt : colors.line },
          focused && shadows.sm,
        ]}
      >
        {icon && <MaterialCommunityIcons name={icon} size={20} color={focused ? colors.cobalt : colors.textMuted} />}
        <TextInput
          accessibilityLabel={label ?? input.placeholder}
          placeholderTextColor={colors.textMuted}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={styles.input}
        />
      </View>
      {(error || hint) && (
        <Text variant="small" color={error ? colors.danger : colors.textMuted}>
          {error || hint}
        </Text>
      )}
    </View>
  );
}

/* ---------- Stars ---------- */

export function Stars({ value, onChange, size = 22 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} disabled={!onChange} onPress={() => onChange?.(n)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${n} כוכבים`}>
          <MaterialCommunityIcons name={n <= value ? 'star' : 'star-outline'} size={size} color={n <= value ? colors.gold : colors.lineStrong} />
        </Pressable>
      ))}
    </View>
  );
}

/* ---------- Stepper (numbers in settings) ---------- */

export function Stepper({ value, onChange, step = 1, min = 0, max = 9999, suffix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + step))} hitSlop={6} accessibilityRole="button" accessibilityLabel="הגדלה">
        <MaterialCommunityIcons name="plus" size={18} color={colors.navy} />
      </Pressable>
      <Text variant="bodyStrong" style={{ minWidth: 56 }} align="center">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - step))} hitSlop={6} accessibilityRole="button" accessibilityLabel="הקטנה">
        <MaterialCommunityIcons name="minus" size={18} color={colors.navy} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: radius.pill, borderWidth: 1 },
  segmented: { flexDirection: 'row', padding: 4, borderRadius: radius.md, gap: 4 },
  segment: { flex: 1, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  track: { width: 52, height: 30, borderRadius: 15, padding: 3, overflow: 'hidden', justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', ...shadows.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 54,
  },
  // minWidth 0: lets narrow fields shrink below the browser's intrinsic input width
  input: { flex: 1, minWidth: 0, fontFamily: fonts.regular, fontSize: 16, color: colors.text, paddingVertical: 12, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.mist, borderRadius: radius.pill, padding: 4, gap: 4 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});

/* ---------- Checkbox (consents) ---------- */

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => {
        haptic();
        onChange(!checked);
      }}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}
      hitSlop={6}
    >
      <MaterialCommunityIcons name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={checked ? colors.cobalt : colors.textMuted} />
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}
