import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../api';
import { Button } from '../../components/Button';
import { Field } from '../../components/Controls';
import { Card, Divider, ErrorState, Hero, InfoLine, Loader, Row, Screen, SectionTitle } from '../../components/Layout';
import { LegalLink } from '../../components/Legal';
import { formatPrice2, OrderBadge, ProductImage } from '../../components/Store';
import { Text } from '../../components/Text';
import { useAsync } from '../../lib/useAsync';
import { Sheet, useFeedback } from '../../state/feedback';
import { colors, space } from '../../theme';

export default function OrderDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useAsync(() => api.getMyOrder(Number(id)), [id]);
  const { toast } = useFeedback();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const o = order.data;

  const beforeHandover = o && ['PENDING_PAYMENT', 'PAID', 'PREPARING', 'READY'].includes(o.status);
  const canReturn = o && ['SHIPPED', 'COMPLETED'].includes(o.status);

  async function submit() {
    setBusy(true);
    try {
      const res = await api.cancelMyOrder(Number(id), reason.trim() || undefined);
      toast(res.returnRequested ? 'בקשת ההחזרה התקבלה - נחזור אליך' : res.refunded ? 'ההזמנה בוטלה והכסף יוחזר' : 'ההזמנה בוטלה');
      setCancelling(false);
      order.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={<Hero back eyebrow="פרטי הזמנה" title={`הזמנה #${id}`} compact>{o && <OrderBadge status={o.status} />}</Hero>}>
      {order.loading ? (
        <Loader />
      ) : order.error || !o ? (
        <ErrorState message={order.error ?? 'לא נמצא'} onRetry={order.reload} />
      ) : (
        <>
          <Card padded={false}>
            {o.items?.map((i, idx) => (
              <View key={i.productId}>
                {idx > 0 && <Divider />}
                <Row style={{ padding: space.md }}>
                  <ProductImage product={{ id: i.productId, hasImage: !!i.hasImage, imageUrl: i.imageUrl ?? null, categoryId: null, nameHe: i.nameHe }} size={52} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{i.nameHe}</Text>
                    <Text variant="small" color={colors.textSoft}>
                      {i.quantity} × {formatPrice2(i.unitPrice)}
                      {!i.isReturnable ? ' · לא ניתן להחזרה לאחר פתיחה' : ''}
                    </Text>
                  </View>
                  <Text variant="bodyStrong">{formatPrice2(i.lineTotal)}</Text>
                </Row>
              </View>
            ))}
          </Card>
          <Card style={{ gap: 4 }}>
            <InfoLine label="משלוח" value={o.deliveryFee ? formatPrice2(o.deliveryFee) : 'חינם'} />
            <InfoLine label="סה״כ ששולם" value={formatPrice2(o.total)} strong />
            {o.refundAmount > 0 && <InfoLine label="זוכה" value={formatPrice2(o.refundAmount)} />}
            <InfoLine label="קבלה" value={o.fulfillment === 'DELIVERY' ? `משלוח ל${o.shipCity ?? ''}` : 'איסוף מהעסק'} />
          </Card>
          {o.cancelReason && (
            <Text variant="small" color={colors.textSoft}>
              {o.cancelReason}
            </Text>
          )}

          {(beforeHandover || canReturn) && (
            <>
              <SectionTitle title={beforeHandover ? 'ביטול ההזמנה' : 'ביטול עסקה והחזרה'} />
              <Text variant="small" color={colors.textSoft}>
                {beforeHandover
                  ? 'ביטול לפני המסירה - החזר כספי מלא ללא דמי ביטול.'
                  : 'ניתן לבקש ביטול עד 14 יום מקבלת המוצר. יש להחזיר את המוצר סגור וללא שימוש.'}{' '}
                <LegalLink docKey="CANCELLATION">מדיניות ביטולים</LegalLink>
              </Text>
              <Button title={beforeHandover ? 'ביטול ההזמנה' : 'בקשת ביטול והחזרה'} variant="ghost" icon="close-circle-outline" onPress={() => setCancelling(true)} />
            </>
          )}
        </>
      )}

      <Sheet visible={cancelling} onClose={() => setCancelling(false)} title={beforeHandover ? 'ביטול ההזמנה' : 'בקשת החזרה'}>
        <Field label="סיבה (לא חובה)" value={reason} onChangeText={setReason} maxLength={200} />
        <Button title="אישור" variant="danger" onPress={submit} loading={busy} />
      </Sheet>
    </Screen>
  );
}
