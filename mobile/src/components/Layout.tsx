import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, gradients, radius, shadows, space } from '../theme';
import { Button, IconButton, type IconName } from './Button';
import { Text } from './Text';
import { Bubbles, Wave } from './Water';

/* ---------- Screen: scroll container with brand background ---------- */

export function Screen({
  children,
  header,
  refreshing,
  onRefresh,
  contentStyle,
  footer,
  scroll = true,
  tabBarSpace = false,
}: {
  children: ReactNode;
  header?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: ViewStyle;
  footer?: ReactNode;
  scroll?: boolean;
  /** leave room for the floating tab bar under the footer */
  tabBarSpace?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const body = (
    <>
      {header}
      <View style={[{ paddingHorizontal: space.lg, gap: space.lg, paddingBottom: footer ? space.lg : 120 }, contentStyle]}>{children}</View>
    </>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.mist }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.aqua} /> : undefined}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{body}</View>
      )}
      {footer && (
        <View style={[styles.footer, { paddingBottom: tabBarSpace ? Math.max(insets.bottom, 10) + 92 : Math.max(insets.bottom, 14) }]}>
          {footer}
        </View>
      )}
    </View>
  );
}

/* ---------- Hero: deep-water header with bubbles and a wave edge ---------- */

export function Hero({
  title,
  subtitle,
  eyebrow,
  back,
  right,
  children,
  compact,
}: {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  back?: boolean;
  right?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  return (
    <View onLayout={onLayout} style={{ marginBottom: space.md }}>
      <LinearGradient colors={gradients.hero} start={{ x: 0.9, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
      {size.w > 0 && <Bubbles width={size.w} height={size.h} opacity={0.6} />}
      <View style={{ paddingTop: insets.top + (compact ? 8 : 14), paddingHorizontal: space.lg, gap: space.md }}>
        {(back || right) && (
          <View style={styles.heroBar}>
            {back ? (
              <IconButton
                icon="arrow-right"
                label="חזרה"
                color={colors.onDark}
                background={colors.glassStrong}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              />
            ) : (
              <View />
            )}
            {right}
          </View>
        )}
        {(eyebrow || title || subtitle) && (
          <View style={{ gap: 6 }}>
            {eyebrow && (
              <Text variant="caption" color={colors.aquaSoft}>
                {eyebrow}
              </Text>
            )}
            {title && (
              <Text variant={compact ? 'h1' : 'display'} color={colors.onDark}>
                {title}
              </Text>
            )}
            {subtitle && <Text color={colors.onDarkSoft}>{subtitle}</Text>}
          </View>
        )}
        {children}
      </View>
      <Wave style={{ marginTop: compact ? 10 : 18 }} />
    </View>
  );
}

/* ---------- Card ---------- */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const inner = [styles.card, padded && { padding: space.lg }, style];
  if (!onPress) return <View style={inner}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [inner, pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 }]}>
      {children}
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="h3">{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="small" weight={fonts.medium} color={colors.cobalt}>
            {action}
          </Text>
          <MaterialCommunityIcons name="chevron-left" size={18} color={colors.cobalt} />
        </Pressable>
      )}
    </View>
  );
}

/** Round tinted icon container. */
export function IconBadge({
  icon,
  color = colors.cobalt,
  background = colors.infoSoft,
  size = 44,
}: {
  icon: IconName;
  color?: string;
  background?: string;
  size?: number;
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons name={icon} size={size * 0.52} color={color} />
    </View>
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: colors.line }, style]} />;
}

/** Label / value line used in summaries and details. */
export function InfoLine({ icon, label, value, strong }: { icon?: IconName; label: string; value: ReactNode; strong?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between', minHeight: 30 }}>
      <Row gap={8}>
        {icon && <MaterialCommunityIcons name={icon} size={18} color={colors.textMuted} />}
        <Text color={colors.textSoft}>{label}</Text>
      </Row>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text variant={strong ? 'h3' : 'bodyStrong'}>{value}</Text>
      ) : (
        value
      )}
    </Row>
  );
}

/* ---------- feedback states ---------- */

export function Loader({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.aqua} />
      {label && <Text color={colors.textMuted}>{label}</Text>}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <IconBadge icon="water-off-outline" color={colors.danger} background={colors.dangerSoft} size={64} />
      <Text variant="h3" align="center">
        משהו השתבש
      </Text>
      <Text color={colors.textSoft} align="center">
        {message}
      </Text>
      {onRetry && <Button title="נסו שוב" variant="secondary" onPress={onRetry} full={false} size="md" icon="refresh" />}
    </View>
  );
}

export function EmptyState({
  icon = 'car-wash',
  title,
  message,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={[styles.center, { paddingVertical: space.xxl }]}>
      <View style={styles.emptyIcon}>
        <LinearGradient colors={['#E9F8FD', '#D4F1FB']} style={StyleSheet.absoluteFill} />
        <MaterialCommunityIcons name={icon} size={40} color={colors.ocean} />
      </View>
      <Text variant="h3" align="center">
        {title}
      </Text>
      {message && (
        <Text color={colors.textSoft} align="center" style={{ maxWidth: 280 }}>
          {message}
        </Text>
      )}
      {action && <Button title={action} onPress={onAction} full={false} size="md" style={{ marginTop: 6 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: 14,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 10,
  },
  heroBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, ...shadows.md },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: -4 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: space.xl, flexGrow: 1 },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
