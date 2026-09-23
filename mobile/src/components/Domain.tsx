import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { Appointment, AppointmentStatus } from '../api';
import { formatRelativeDay } from '../lib/dates';
import { BOOKING_TYPE_LABEL, formatPlate, formatPrice, STATUS_LABEL } from '../lib/format';
import { colors, fonts, gradients, radius, shadows, space } from '../theme';
import type { IconName } from './Button';
import { Card, Row } from './Layout';
import { Text } from './Text';
import { Sparkle } from './Water';

const STATUS_STYLE: Record<AppointmentStatus, { fg: string; bg: string; icon: IconName }> = {
  PENDING_PAYMENT: { fg: colors.warning, bg: colors.warningSoft, icon: 'timer-sand' },
  CONFIRMED: { fg: colors.cobalt, bg: colors.infoSoft, icon: 'calendar-check' },
  IN_PROGRESS: { fg: '#0B8FB3', bg: colors.foam, icon: 'water' },
  COMPLETED: { fg: colors.success, bg: colors.successSoft, icon: 'check-circle' },
  CANCELLED: { fg: colors.textMuted, bg: '#EEF2F5', icon: 'close-circle' },
  NO_SHOW: { fg: colors.danger, bg: colors.dangerSoft, icon: 'account-cancel' },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <MaterialCommunityIcons name={s.icon} size={13} color={s.fg} />
      <Text variant="caption" color={s.fg}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

export function Tag({ label, color = colors.textSoft, background = colors.mist, icon }: { label: string; color?: string; background?: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      {icon && <MaterialCommunityIcons name={icon} size={13} color={color} />}
      <Text variant="caption" color={color}>
        {label}
      </Text>
    </View>
  );
}

/** Israeli licence plate: yellow, black digits, blue "IL" strip. */
export function Plate({ number, scale = 1 }: { number: string | null | undefined; scale?: number }) {
  if (!number) return null;
  const w = 118 * scale;
  const h = 28 * scale;
  return (
    <Svg width={w} height={h} viewBox="0 0 118 28">
      <Defs>
        <SvgGradient id="plateBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFD43B" />
          <Stop offset="1" stopColor="#FCC419" />
        </SvgGradient>
      </Defs>
      <Rect x="0.5" y="0.5" width="117" height="27" rx="5" fill="url(#plateBg)" stroke="#1F2937" strokeWidth="1" />
      <Rect x="1" y="1" width="16" height="26" rx="4" fill="#1C4ED8" />
      <SvgText x="9" y="18" fontSize="8" fontFamily={fonts.bold} fill="#fff" textAnchor="middle">
        IL
      </SvgText>
      <SvgText x="67" y="19.5" fontSize="14" fontFamily={fonts.bold} fill="#111827" textAnchor="middle" letterSpacing="0.5">
        {formatPlate(number)}
      </SvgText>
    </Svg>
  );
}

const SERVICE_ICON: Record<string, IconName> = {
  EXTERIOR: 'spray',
  INTERIOR: 'vacuum',
  FULL: 'car-wash',
};

export const serviceIcon = (code: string): IconName => SERVICE_ICON[code] ?? 'car-wash';
export const vehicleIcon = (code: string): IconName => (code === 'JEEP' ? 'car-estate' : 'car-side');

/** Appointment row used in customer history and in the admin lists. */
export function AppointmentCard({
  appointment: a,
  onPress,
  showCustomer,
  footer,
  style,
}: {
  appointment: Appointment;
  onPress?: () => void;
  showCustomer?: boolean;
  footer?: React.ReactNode;
  style?: ViewStyle;
}) {
  const muted = a.status === 'CANCELLED';
  return (
    <Card onPress={onPress} padded={false} style={style}>
      <View style={{ padding: space.md, gap: 12, opacity: muted ? 0.7 : 1 }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={styles.timeBox}>
            <Text variant="h3" color={colors.navy}>
              {a.time}
            </Text>
            <Text variant="caption" color={colors.textMuted}>
              {formatRelativeDay(a.date)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Row gap={6}>
              <MaterialCommunityIcons name={serviceIcon(a.serviceCode)} size={18} color={colors.ocean} />
              <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
                {a.serviceName}
              </Text>
            </Row>
            {showCustomer ? (
              <Text variant="small" color={colors.textSoft} numberOfLines={1}>
                {a.customerName || 'לקוח'} · {a.vehicleTypeName}
              </Text>
            ) : (
              <Text variant="small" color={colors.textSoft}>
                {a.vehicleTypeName}
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text variant="h3">{formatPrice(a.price - a.discountAmount)}</Text>
            <StatusBadge status={a.status} />
          </View>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6}>
            <Tag
              label={BOOKING_TYPE_LABEL[a.bookingType]}
              icon={a.bookingType === 'FUTURE' ? 'calendar-arrow-left' : 'lightning-bolt'}
              color={a.bookingType === 'FUTURE' ? colors.ocean : '#0B8FB3'}
              background={a.bookingType === 'FUTURE' ? colors.infoSoft : colors.foam}
            />
            {a.depositAmount > 0 && <Tag label={`מקדמה ${formatPrice(a.depositAmount)}`} icon="shield-check-outline" />}
            {a.isFreeLoyalty && <Tag label="מתנת מועדון" icon="gift-outline" color="#B7791F" background="#FFF6DD" />}
          </Row>
          <Plate number={a.plateNumber} scale={0.8} />
        </Row>
        {footer}
      </View>
    </Card>
  );
}

/** Dark KPI tile for the admin dashboard. */
export function StatTile({
  label,
  value,
  icon,
  hint,
  tone = 'light',
  style,
}: {
  label: string;
  value: string | number;
  icon: IconName;
  hint?: string;
  tone?: 'light' | 'dark' | 'aqua';
  style?: ViewStyle;
}) {
  const dark = tone !== 'light';
  const content = (
    <View style={{ padding: space.md, gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="small" color={dark ? colors.onDarkSoft : colors.textSoft}>
          {label}
        </Text>
        <MaterialCommunityIcons name={icon} size={20} color={dark ? colors.aquaSoft : colors.cobalt} />
      </Row>
      <Text variant="number" color={dark ? colors.onDark : colors.text}>
        {value}
      </Text>
      {hint && (
        <Text variant="caption" color={dark ? colors.onDarkMuted : colors.textMuted}>
          {hint}
        </Text>
      )}
    </View>
  );
  if (!dark) return <View style={[styles.tile, { backgroundColor: colors.surface }, shadows.sm, style]}>{content}</View>;
  return (
    <View style={[styles.tile, shadows.md, style]}>
      <LinearGradient colors={tone === 'aqua' ? gradients.primary : gradients.deep} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {content}
    </View>
  );
}

/** Minimal bar chart - bars grow from the bottom; RTL order = oldest on the right. */
export function BarChart({
  data,
  height = 120,
  highlightLast = true,
  formatValue,
}: {
  data: { label: string; value: number }[];
  height?: number;
  highlightLast?: boolean;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {data.map((d, i) => {
          const last = highlightLast && i === data.length - 1;
          const h = Math.max(4, (d.value / max) * (height - 20));
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              {d.value > 0 && (
                <Text variant="caption" color={last ? colors.cobalt : colors.textMuted} numberOfLines={1}>
                  {formatValue ? formatValue(d.value) : d.value}
                </Text>
              )}
              <View style={{ width: '100%', maxWidth: 34, height: h, borderRadius: 8, overflow: 'hidden', backgroundColor: '#DCEBF5' }}>
                {last && <LinearGradient colors={gradients.primary} style={StyleSheet.absoluteFill} />}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {data.map((d, i) => (
          <Text key={i} variant="caption" color={colors.textMuted} align="center" style={{ flex: 1 }} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Horizontal share bar (e.g. revenue by service). */
export function ShareBar({ label, value, total, detail }: { label: string; value: number; total: number; detail: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="small" color={colors.textSoft}>
          {detail}
        </Text>
      </Row>
      <View style={{ height: 10, backgroundColor: colors.mist, borderRadius: 5, overflow: 'hidden' }}>
        <LinearGradient colors={gradients.primary} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={{ width: `${pct}%`, height: '100%', borderRadius: 5 }} />
      </View>
    </View>
  );
}

/** Punch card: one water drop per wash, the last one is the free wash. */
export function LoyaltyCard({ punches, needed, onRedeem }: { punches: number; needed: number; onRedeem?: () => void }) {
  const filled = Math.min(punches, needed);
  const ready = punches >= needed;
  return (
    <View style={[styles.loyalty, shadows.md]}>
      <LinearGradient colors={['#0F4C81', '#0B2C4B']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ gap: 2 }}>
          <Text variant="caption" color={colors.aquaSoft}>
            כרטיסיית מועדון
          </Text>
          <Text variant="h2" color={colors.onDark}>
            {ready ? 'מגיעה לך שטיפה מתנה!' : `עוד ${needed - filled} לשטיפה מתנה`}
          </Text>
        </View>
        <Sparkle size={22} color={colors.gold} />
      </Row>
      <View style={styles.drops}>
        {Array.from({ length: needed }, (_, i) => {
          const on = i < filled;
          const gift = i === needed - 1;
          return (
            <View key={i} style={[styles.drop, on ? { backgroundColor: colors.aqua, borderColor: colors.aquaSoft } : { borderColor: colors.glassLine }]}>
              <MaterialCommunityIcons
                name={gift ? 'gift' : on ? 'water' : 'water-outline'}
                size={16}
                color={gift ? (on ? colors.navy : colors.gold) : on ? colors.navy : colors.onDarkMuted}
              />
            </View>
          );
        })}
      </View>
      {ready && onRedeem && (
        <Text variant="small" color={colors.gold} weight={fonts.semibold}>
          בחרו "מימוש מתנה" בשלב הסיכום של ההזמנה הבאה
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  timeBox: { width: 64, height: 56, borderRadius: radius.md, backgroundColor: colors.foam, alignItems: 'center', justifyContent: 'center' },
  tile: { flex: 1, borderRadius: radius.lg, overflow: 'hidden', minWidth: 140 },
  loyalty: { borderRadius: radius.xl, overflow: 'hidden', padding: space.lg, gap: space.md },
  drops: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, justifyContent: 'space-between' },
  drop: { width: '18%', aspectRatio: 1, maxWidth: 48, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
