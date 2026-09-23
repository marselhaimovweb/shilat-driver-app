import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import { api, type OrderStatus, type Product } from '../api';
import { formatPrice } from '../lib/format';
import { colors, radius } from '../theme';
import type { IconName } from './Button';
import { Row } from './Layout';
import { Text } from './Text';

export const ORDER_STATUS: Record<OrderStatus, { label: string; fg: string; bg: string; icon: IconName }> = {
  PENDING_PAYMENT: { label: 'ממתינה לתשלום', fg: colors.warning, bg: colors.warningSoft, icon: 'timer-sand' },
  PAID: { label: 'התקבלה', fg: colors.cobalt, bg: colors.infoSoft, icon: 'check' },
  PREPARING: { label: 'בהכנה', fg: '#0B8FB3', bg: colors.foam, icon: 'package-variant' },
  READY: { label: 'מוכנה לאיסוף', fg: colors.success, bg: colors.successSoft, icon: 'store-check-outline' },
  SHIPPED: { label: 'נשלחה', fg: '#7048E8', bg: '#F0EBFF', icon: 'truck-fast-outline' },
  COMPLETED: { label: 'נמסרה', fg: colors.success, bg: colors.successSoft, icon: 'check-circle' },
  CANCELLED: { label: 'בוטלה', fg: colors.textMuted, bg: '#EEF2F5', icon: 'close-circle' },
  RETURN_REQUESTED: { label: 'בקשת החזרה', fg: colors.warning, bg: colors.warningSoft, icon: 'keyboard-return' },
  REFUNDED: { label: 'זוכתה', fg: colors.textSoft, bg: '#EEF2F5', icon: 'cash-refund' },
};

export function OrderBadge({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <MaterialCommunityIcons name={s.icon} size={13} color={s.fg} />
      <Text variant="caption" color={s.fg}>
        {s.label}
      </Text>
    </View>
  );
}

const CATEGORY_ICON: Record<number, IconName> = { 1: 'spray-bottle', 2: 'shimmer', 3: 'hand-wash-outline', 4: 'flower-outline' };

/** Product photo, or a branded placeholder when there is none. */
export function ProductImage({
  product,
  size,
  style,
}: {
  product: Pick<Product, 'id' | 'hasImage' | 'imageUrl' | 'categoryId' | 'nameHe'>;
  size?: number;
  style?: ViewStyle;
}) {
  const uri = api.productImageUrl(product);
  const box = [styles.image, size ? { width: size, height: size } : { width: '100%' as const, aspectRatio: 1 }, style];
  if (uri) return <Image source={{ uri }} style={box as never} resizeMode="cover" accessibilityLabel={product.nameHe} />;
  return (
    <View style={box} accessibilityLabel={product.nameHe}>
      <LinearGradient colors={['#E9F8FD', '#CDEFFA']} style={StyleSheet.absoluteFill} />
      <MaterialCommunityIcons name={CATEGORY_ICON[product.categoryId ?? 0] ?? 'car-wash'} size={size ? size * 0.45 : 48} color={colors.ocean} />
    </View>
  );
}

export function PriceTag({ price, compareAt, big }: { price: number; compareAt?: number | null; big?: boolean }) {
  return (
    <Row gap={8}>
      <Text variant={big ? 'h1' : 'h3'} color={colors.navy}>
        {formatPrice2(price)}
      </Text>
      {!!compareAt && compareAt > price && (
        <Text variant="small" color={colors.textMuted} style={{ textDecorationLine: 'line-through' }} accessibilityLabel={`במקום ${compareAt} שקלים`}>
          {formatPrice2(compareAt)}
        </Text>
      )}
    </Row>
  );
}

/** Prices with agorot (49.90) - store prices are not always round. */
export const formatPrice2 = (n: number) => (Number.isInteger(Number(n)) ? formatPrice(n) : `₪${Number(n).toFixed(2)}`);

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  image: { borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.foam },
});
