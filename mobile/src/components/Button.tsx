import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, gradients, radius, shadows } from '../theme';
import { Text } from './Text';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type Variant = 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger' | 'success' | 'glass';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  iconPosition?: 'start' | 'end';
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg' | 'sm';
  style?: ViewStyle;
  full?: boolean;
}

export function haptic(kind: 'light' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  else Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

const FILLS: Partial<Record<Variant, readonly [string, string]>> = {
  primary: gradients.primary,
  dark: gradients.deep,
  danger: gradients.danger,
  success: gradients.success,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  iconPosition = 'start',
  loading,
  disabled,
  size = 'lg',
  style,
  full = true,
}: ButtonProps) {
  const fill = FILLS[variant];
  const height = size === 'lg' ? 56 : size === 'md' ? 46 : 36;
  const fg =
    variant === 'secondary' ? colors.cobalt : variant === 'ghost' ? colors.textSoft : variant === 'glass' ? colors.onDark : colors.onDark;
  const inactive = disabled || loading;

  const content = (
    <View style={[styles.content, { height, paddingHorizontal: size === 'sm' ? 14 : 22 }]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && iconPosition === 'start' && <MaterialCommunityIcons name={icon} size={size === 'sm' ? 16 : 20} color={fg} />}
          <Text variant={size === 'sm' ? 'small' : 'bodyStrong'} color={fg} weight={size === 'sm' ? undefined : 'Rubik_600SemiBold'}>
            {title}
          </Text>
          {icon && iconPosition === 'end' && <MaterialCommunityIcons name={icon} size={size === 'sm' ? 16 : 20} color={fg} />}
        </>
      )}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      disabled={inactive}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      style={({ pressed }) => [
        { borderRadius: size === 'sm' ? radius.pill : radius.md, alignSelf: full ? 'stretch' : 'flex-start' },
        variant === 'primary' && !inactive && shadows.glow,
        { opacity: inactive ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      {fill ? (
        <LinearGradient
          colors={fill}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ borderRadius: size === 'sm' ? radius.pill : radius.md }}
        >
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            { borderRadius: size === 'sm' ? radius.pill : radius.md },
            variant === 'secondary' && { backgroundColor: colors.infoSoft },
            variant === 'glass' && { backgroundColor: colors.glassStrong, borderWidth: 1, borderColor: colors.glassLine },
            variant === 'ghost' && { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color = colors.text,
  background = colors.surface,
  size = 42,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  background?: string;
  size?: number;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      hitSlop={8}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center' },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={size * 0.5} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
