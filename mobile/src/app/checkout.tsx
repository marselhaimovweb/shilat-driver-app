import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError } from '../api';
import { Button } from '../components/Button';
import { Checkbox, Field, Segmented } from '../components/Controls';
import { Card, Divider, Hero, InfoLine, Row, Screen, SectionTitle } from '../components/Layout';
import { LegalLink } from '../components/Legal';
import { formatPrice2 } from '../components/Store';
import { Text } from '../components/Text';
import { useAsync } from '../lib/useAsync';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';
import { useFeedback } from '../state/feedback';
import { colors, fonts, radius } from '../theme';

export default function Checkout() {
  const cart = useCart();
  const { config } = useConfig();
  const { toast } = useFeedback();
  const store = useAsync(() => api.getStore(), []);
  const me = useAsync(() => api.getMe(), []);
  const deliveryOn = !!config?.features.STORE_DELIVERY;
  const [fulfillment, setFulfillment] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const lines = cart.lines.map((l) => ({ ...l, product: store.data?.products.find((p) => p.id === l.productId) })).filter((l) => l.product);
  const subtotal = lines.reduce((s, l) => s + l.product!.price * l.quantity, 0);
  const fee = fulfillment === 'DELIVERY' && subtotal < (config?.rules.storeFreeDeliveryFrom ?? 0) ? (config?.rules.storeDeliveryFee ?? 0) : 0;
  const total = subtotal + fee;
  const vat = config?.rules.vatRate ?? 18;
  const b = config?.business;

  async function pay() {
    if (fulfillment === 'DELIVERY' && (!(name || me.data?.fullName) || !address.trim() || !city.trim())) return toast('נא למלא שם, כתובת ועיר למשלוח', 'error');
    setBusy(true);
    try {
      const res = await api.createOrder({
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        fulfillment,
        shipName: (name || me.data?.fullName || '').trim() || undefined,
        shipPhone: (phone || me.data?.phone || '').trim() || undefined,
        shipAddress: fulfillment === 'DELIVERY' ? address.trim() : undefined,
        shipCity: fulfillment === 'DELIVERY' ? city.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      router.push({
        pathname: '/payment',
        params: {
          paymentId: String(res.payment.id),
          target: 'ORDER',
          targetId: String(res.order.id),
          amount: String(res.payment.amount),
          hold: String(res.holdMinutes),
          url: res.payment.checkoutUrl ?? '',
        },
      });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONSENT_REQUIRED') return router.push('/consent');
      toast((e as Error).message, 'error');
      store.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      header={<Hero back eyebrow="השלמת הזמנה" title="תשלום ומסירה" compact />}
      footer={
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text color={colors.textSoft}>לתשלום (כולל מע״מ)</Text>
            <Text variant="h2">{formatPrice2(total)}</Text>
          </Row>
          <Button title={`תשלום מאובטח ${formatPrice2(total)}`} icon="lock" onPress={pay} disabled={!agreed || !lines.length} loading={busy} />
        </>
      }
    >
      <SectionTitle title="אופן קבלה" />
      <Segmented
        value={fulfillment}
        onChange={setFulfillment}
        options={[
          { value: 'PICKUP', label: 'איסוף מהעסק (חינם)', icon: 'store-outline' },
          ...(deliveryOn ? [{ value: 'DELIVERY' as const, label: 'משלוח עד הבית', icon: 'truck-fast-outline' as const }] : []),
        ]}
      />
      {fulfillment === 'PICKUP' ? (
        <Card style={{ gap: 4 }}>
          <Text variant="bodyStrong">{b?.address}</Text>
          <Text variant="small" color={colors.textSoft}>
            נעדכן כשההזמנה מוכנה. ההזמנה נשמרת {config?.rules.storePickupHoldDays ?? 14} ימים.
          </Text>
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          <Field label="שם מלא" value={name} onChangeText={setName} placeholder={me.data?.fullName ?? ''} />
          <Field label="טלפון" keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder={me.data?.phone ?? ''} />
          <Field label="רחוב ומספר" value={address} onChangeText={setAddress} />
          <Field label="עיר" value={city} onChangeText={setCity} />
          <Text variant="small" color={colors.textSoft}>
            זמן אספקה משוער: {config?.rules.storeDeliveryDays}
          </Text>
        </Card>
      )}
      <Field label="הערות להזמנה (לא חובה)" value={notes} onChangeText={setNotes} maxLength={300} />

      <SectionTitle title="סיכום" />
      <Card style={{ gap: 4 }}>
        {lines.map((l) => (
          <InfoLine key={l.productId} label={`${l.product!.nameHe} × ${l.quantity}`} value={formatPrice2(l.product!.price * l.quantity)} />
        ))}
        <Divider style={{ marginVertical: 6 }} />
        <InfoLine label="דמי משלוח" value={fee ? formatPrice2(fee) : 'חינם'} />
        <InfoLine label="סה״כ לתשלום" value={formatPrice2(total)} strong />
        <Text variant="caption" color={colors.textMuted}>
          כולל מע״מ {vat}% ({formatPrice2(total - total / (1 + vat / 100))})
        </Text>
      </Card>

      {/* Consumer Protection Law 14C - seller details and cancellation terms before the purchase */}
      <View style={{ backgroundColor: colors.foam, borderRadius: radius.md, padding: 14, gap: 4 }}>
        <Text variant="small" weight={fonts.semibold}>
          פרטי המוכר
        </Text>
        <Text variant="small" color={colors.textSoft}>
          {b?.legalName}
          {b?.taxId ? ` · ע.מ./ח.פ. ${b.taxId}` : ''} · {b?.address} · {b?.phone}
          {b?.email ? ` · ${b.email}` : ''}
        </Text>
        <Text variant="small" color={colors.textSoft}>
          ניתן לבטל את העסקה תוך 14 יום מקבלת המוצר (מוצר סגור וללא שימוש). דמי ביטול: 5% או 100 ₪ - הנמוך מביניהם; ביטול לפני המשלוח - ללא דמי ביטול.
        </Text>
      </View>

      <Card>
        <Checkbox checked={agreed} onChange={setAgreed}>
          <Text>
            קראתי ואני מסכים/ה ל<LegalLink docKey="TERMS">תקנון</LegalLink> ול<LegalLink docKey="CANCELLATION">מדיניות הביטולים וההחזרות</LegalLink>, ומאשר/ת את פרטי ההזמנה.
          </Text>
        </Checkbox>
      </Card>
    </Screen>
  );
}
