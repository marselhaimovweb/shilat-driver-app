import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Order } from '../api';
import { Button, haptic } from '../components/Button';
import { Divider, InfoLine } from '../components/Layout';
import { LegalLink } from '../components/Legal';
import { formatPrice2 } from '../components/Store';
import { Text } from '../components/Text';
import { Bubbles } from '../components/Water';
import { useConfig } from '../state/config';
import { colors, gradients, radius, shadows, space } from '../theme';

/** Order confirmation - also serves as the disclosure document required for distance sales. */
export default function OrderSuccess() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { config } = useConfig();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    haptic('success');
    api.getMyOrder(Number(id)).then(setOrder).catch(() => undefined);
  }, [id]);

  const b = config?.business;
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
      {w > 0 && <Bubbles width={w} height={420} />}
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.xl, paddingHorizontal: space.lg, paddingBottom: insets.bottom + 24, gap: space.lg, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View style={[styles.check, shadows.glow]}>
            <LinearGradient colors={gradients.primary} style={StyleSheet.absoluteFill} />
            <MaterialCommunityIcons name="shopping-outline" size={44} color="#fff" />
          </View>
          <Text variant="display" color="#fff" align="center">
            ההזמנה התקבלה!
          </Text>
          <Text color={colors.onDarkSoft} align="center">
            {order?.fulfillment === 'DELIVERY' ? `נשלח אליך תוך ${config?.rules.storeDeliveryDays}` : 'נעדכן כשההזמנה מוכנה לאיסוף מהעסק'}
          </Text>
        </View>

        {order && (
          <View style={[styles.ticket, shadows.lg]}>
            <Text variant="h2">הזמנה #{order.id}</Text>
            <Text variant="small" color={colors.textSoft}>
              {new Date(order.createdAt).toLocaleString('he-IL')}
            </Text>
            <Divider style={{ marginVertical: 8 }} />
            {order.items?.map((i) => (
              <InfoLine key={i.productId} label={`${i.nameHe} × ${i.quantity}`} value={formatPrice2(i.lineTotal)} />
            ))}
            <InfoLine label="משלוח" value={order.deliveryFee ? formatPrice2(order.deliveryFee) : 'חינם'} />
            <InfoLine label="שולם" value={formatPrice2(order.total)} strong />
            <Text variant="caption" color={colors.textMuted}>
              כולל מע״מ {order.vatRate}%
            </Text>
            <Divider style={{ marginVertical: 8 }} />
            <Text variant="small" color={colors.textSoft}>
              המוכר: {b?.legalName}
              {b?.taxId ? `, ע.מ./ח.פ. ${b.taxId}` : ''}, {b?.address}, טל׳ {b?.phone}
            </Text>
            <Text variant="small" color={colors.textSoft}>
              ביטול עסקה: עד 14 יום מקבלת המוצר, דרך "ההזמנות שלי", בטלפון או בדוא״ל. <LegalLink docKey="CANCELLATION">מדיניות ביטולים והחזרות</LegalLink>
            </Text>
          </View>
        )}

        <Button title="להזמנות שלי" icon="receipt" onPress={() => router.replace('/orders')} />
        <Button title="חזרה לחנות" variant="glass" onPress={() => router.replace('/store')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ticket: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, gap: 4 },
});
