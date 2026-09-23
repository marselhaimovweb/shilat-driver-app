import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { api, type OrderStatus } from '../../../../api';
import { Button } from '../../../../components/Button';
import { Field, Toggle } from '../../../../components/Controls';
import { Card, Divider, ErrorState, Hero, InfoLine, Loader, Row, Screen, SectionTitle } from '../../../../components/Layout';
import { formatPrice2, OrderBadge, ProductImage } from '../../../../components/Store';
import { Text } from '../../../../components/Text';
import { formatPhone } from '../../../../lib/format';
import { useAsync } from '../../../../lib/useAsync';
import { Sheet, useFeedback } from '../../../../state/feedback';
import { useSession } from '../../../../state/session';
import { colors, space } from '../../../../theme';

export default function AdminOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast, confirm } = useFeedback();
  const { session } = useSession();
  const order = useAsync(() => api.adminGetOrder(Number(id)), [id]);
  const [notes, setNotes] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refund, setRefund] = useState('');
  const [restock, setRestock] = useState(true);
  const o = order.data;
  const canMoney = session?.adminRole !== 'STAFF';

  useEffect(() => {
    if (o) {
      setNotes(o.adminNotes ?? '');
      setRefund(String(o.total));
    }
  }, [o]);

  async function setStatus(status: OrderStatus, extra: { reason?: string; refundAmount?: number; restock?: boolean } = {}) {
    try {
      order.setData(await api.adminSetOrderStatus(Number(id), { status, ...extra }));
      toast('ההזמנה עודכנה');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const actions: { title: string; status: OrderStatus; icon: 'package-variant' | 'store-check-outline' | 'truck-fast-outline' | 'check-circle-outline' }[] = [];
  if (o) {
    if (o.status === 'PAID') actions.push({ title: 'התחלת הכנה', status: 'PREPARING', icon: 'package-variant' });
    if (['PAID', 'PREPARING'].includes(o.status)) {
      if (o.fulfillment === 'PICKUP') actions.push({ title: 'מוכנה לאיסוף', status: 'READY', icon: 'store-check-outline' });
      else actions.push({ title: 'סימון כנשלחה', status: 'SHIPPED', icon: 'truck-fast-outline' });
    }
    if (['READY', 'SHIPPED'].includes(o.status)) actions.push({ title: 'נמסרה ללקוח', status: 'COMPLETED', icon: 'check-circle-outline' });
  }

  return (
    <Screen header={<Hero back eyebrow="הזמנה מהחנות" title={`#${id}`} compact>{o && <OrderBadge status={o.status} />}</Hero>}>
      {order.loading ? (
        <Loader />
      ) : order.error || !o ? (
        <ErrorState message={order.error ?? 'לא נמצא'} onRetry={order.reload} />
      ) : (
        <>
          {actions.length > 0 && (
            <Card style={{ gap: 10 }}>
              {actions.map((a) => (
                <Button key={a.status} title={a.title} icon={a.icon} onPress={() => setStatus(a.status)} />
              ))}
            </Card>
          )}
          {o.status === 'RETURN_REQUESTED' && (
            <Card style={{ gap: 10, borderWidth: 1.5, borderColor: colors.warning }}>
              <Text variant="h3">בקשת ביטול / החזרה</Text>
              {!!o.cancelReason && <Text color={colors.textSoft}>סיבה: {o.cancelReason}</Text>}
              <Text variant="small" color={colors.textSoft}>
                לפי החוק ניתן לגבות דמי ביטול של 5% או 100 ₪ (הנמוך מביניהם), אלא אם המוצר פגום. ההחזר - תוך 14 יום.
              </Text>
              {canMoney && <Button title="אישור החזרה וזיכוי" variant="success" icon="cash-refund" onPress={() => setRefundOpen(true)} />}
              <Button title="דחיית הבקשה" variant="ghost" onPress={() => setStatus('COMPLETED', { reason: 'בקשת ההחזרה נדחתה' })} />
            </Card>
          )}

          <SectionTitle title="פריטים" />
          <Card padded={false}>
            {o.items?.map((i, idx) => (
              <View key={i.productId}>
                {idx > 0 && <Divider />}
                <Row style={{ padding: space.md }}>
                  <ProductImage product={{ id: i.productId, hasImage: !!i.hasImage, imageUrl: i.imageUrl ?? null, categoryId: null, nameHe: i.nameHe }} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{i.nameHe}</Text>
                    <Text variant="small" color={colors.textSoft}>
                      {i.quantity} × {formatPrice2(i.unitPrice)}
                    </Text>
                  </View>
                  <Text variant="bodyStrong">{formatPrice2(i.lineTotal)}</Text>
                </Row>
              </View>
            ))}
          </Card>
          <Card style={{ gap: 4 }}>
            <InfoLine label="סכום ביניים" value={formatPrice2(o.subtotal)} />
            <InfoLine label="משלוח" value={o.deliveryFee ? formatPrice2(o.deliveryFee) : 'חינם'} />
            <InfoLine label="סה״כ שולם" value={formatPrice2(o.total)} strong />
            {o.refundAmount > 0 && <InfoLine label="זוכה" value={formatPrice2(o.refundAmount)} />}
          </Card>

          <SectionTitle title="לקוח ומסירה" />
          <Card style={{ gap: 6 }}>
            <InfoLine icon="account-outline" label="לקוח" value={o.shipName ?? o.customerName ?? '—'} />
            <InfoLine icon="phone-outline" label="טלפון" value={formatPhone(o.shipPhone ?? o.customerPhone)} />
            <InfoLine icon={o.fulfillment === 'DELIVERY' ? 'truck-fast-outline' : 'store-outline'} label="מסירה" value={o.fulfillment === 'DELIVERY' ? 'משלוח' : 'איסוף עצמי'} />
            {o.fulfillment === 'DELIVERY' && <Text color={colors.textSoft}>{[o.shipAddress, o.shipCity].filter(Boolean).join(', ')}</Text>}
            {!!o.customerNotes && <Text color={colors.textSoft}>הערת לקוח: {o.customerNotes}</Text>}
            <Button title="התקשרות ללקוח" icon="phone" variant="secondary" size="md" onPress={() => Linking.openURL(`tel:${o.shipPhone ?? o.customerPhone}`)} />
          </Card>

          <SectionTitle title="הערות פנימיות" />
          <Card style={{ gap: 10 }}>
            <Field value={notes} onChangeText={setNotes} multiline maxLength={300} placeholder="לא מוצג ללקוח" />
            <Button
              title="שמירת הערה"
              variant="secondary"
              size="md"
              onPress={async () => {
                await api.adminSetOrderNotes(o.id, notes);
                toast('נשמר');
              }}
            />
          </Card>

          {canMoney && ['PENDING_PAYMENT', 'PAID', 'PREPARING', 'READY'].includes(o.status) && (
            <Button
              title="ביטול ההזמנה והחזר מלא"
              variant="ghost"
              icon="close-circle-outline"
              onPress={async () => {
                if (await confirm({ title: 'לבטל את ההזמנה?', message: 'הלקוח יקבל החזר מלא והמלאי יוחזר.', confirmText: 'ביטול ההזמנה', destructive: true })) {
                  setStatus('CANCELLED', { reason: 'בוטל ע״י העסק' });
                }
              }}
            />
          )}
        </>
      )}

      <Sheet visible={refundOpen} onClose={() => setRefundOpen(false)} title="זיכוי הלקוח">
        <Field label="סכום לזיכוי (₪)" keyboardType="decimal-pad" value={refund} onChangeText={(t) => setRefund(t.replace(/[^\d.]/g, ''))} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="bodyStrong">החזרת המוצרים למלאי</Text>
          <Toggle label="החזרה למלאי" value={restock} onChange={setRestock} />
        </Row>
        <Button
          title={`זיכוי ${formatPrice2(Number(refund) || 0)}`}
          variant="success"
          onPress={async () => {
            setRefundOpen(false);
            await setStatus('REFUNDED', { refundAmount: Number(refund) || 0, restock });
          }}
        />
      </Sheet>
    </Screen>
  );
}
