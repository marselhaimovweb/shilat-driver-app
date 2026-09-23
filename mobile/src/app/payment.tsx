import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, type PaymentResult } from '../api';
import { Button } from '../components/Button';
import { Field } from '../components/Controls';
import { Card, Hero, Row, Screen } from '../components/Layout';
import { formatPrice2 } from '../components/Store';
import { Text } from '../components/Text';
import { Bubbles } from '../components/Water';
import { useCart } from '../state/cart';
import { useFeedback } from '../state/feedback';
import { colors, fonts, radius, shadows, space } from '../theme';

/*
 * Payment for a future-booking deposit or a store order.
 * - demo provider: an in-app card form (nothing is charged)
 * - real provider (Cardcom / Tranzila): the clearing company's secure page opens
 *   in the browser; the app polls the server until the payment is confirmed.
 */
export default function Payment() {
  const p = useLocalSearchParams<{ paymentId: string; target?: string; targetId?: string; appointmentId?: string; amount: string; hold: string; url?: string }>();
  const { toast } = useFeedback();
  const cart = useCart();
  const isOrder = p.target === 'ORDER';
  const amount = Number(p.amount);
  const [secondsLeft, setSecondsLeft] = useState(Number(p.hold || 15) * 60);
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const done = useRef(false);

  const finish = useCallback(
    (result: PaymentResult) => {
      if (done.current) return;
      done.current = true;
      if (result.type === 'ORDER') {
        cart.clear();
        router.replace({ pathname: '/order-success', params: { id: String(result.id) } });
      } else router.replace({ pathname: '/booking-success', params: { id: String(result.id) } });
    },
    [cart],
  );

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // real providers: poll the server for the webhook result
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const s = await api.getPaymentStatus(Number(p.paymentId));
        if (s.status === 'SUCCEEDED') finish({ type: s.type, id: s.targetId });
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [waiting, p.paymentId, finish]);

  const cardDigits = card.replace(/\D/g, '');
  const valid = cardDigits.length >= 8 && /^\d{2}\/?\d{2}$/.test(expiry.replace(/\s/g, '')) && cvv.length >= 3;

  async function payDemo() {
    setBusy(true);
    try {
      finish(await api.confirmDemoPayment(Number(p.paymentId)));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openProvider() {
    setWaiting(true);
    await WebBrowser.openBrowserAsync(p.url!).catch(() => undefined);
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const expired = secondsLeft === 0;

  return (
    <Screen
      header={
        <Hero
          back
          eyebrow="תשלום מאובטח"
          title={isOrder ? `הזמנה ${formatPrice2(amount)}` : `מקדמה ${formatPrice2(amount)}`}
          subtitle={isOrder ? 'המחיר כולל מע״מ' : 'המקדמה מקוזזת מהמחיר ביום השטיפה'}
          compact
        />
      }
      footer={
        p.url ? (
          <Button title={waiting ? 'ממתינים לאישור התשלום...' : 'מעבר לדף התשלום המאובטח'} icon="open-in-new" onPress={openProvider} disabled={expired} loading={false} />
        ) : (
          <Button title={`תשלום ${formatPrice2(amount)}`} icon="lock" onPress={payDemo} loading={busy} disabled={!valid || expired} />
        )
      }
    >
      <Row style={[styles.timer, expired && { backgroundColor: colors.dangerSoft }]}>
        <MaterialCommunityIcons name="timer-sand" size={20} color={expired ? colors.danger : colors.warning} />
        <Text style={{ flex: 1 }} color={colors.text}>
          {expired ? (isOrder ? 'זמן ההמתנה הסתיים - יש לבצע את ההזמנה מחדש' : 'זמן השריון הסתיים - יש לקבוע את התור מחדש') : isOrder ? 'המוצרים שמורים עבורך למשך' : 'השעה שמורה עבורך למשך'}
        </Text>
        {!expired && (
          <Text variant="h3" color={colors.warning} style={{ fontVariant: ['tabular-nums'] }} accessibilityLabel={`${mm} דקות ו-${ss} שניות`}>
            {mm}:{ss}
          </Text>
        )}
      </Row>

      {p.url ? (
        <Card style={{ gap: 10 }}>
          <Text variant="bodyStrong">התשלום מתבצע בדף המאובטח של חברת הסליקה</Text>
          <Text color={colors.textSoft}>לאחר התשלום חזרו לאפליקציה - האישור יופיע כאן אוטומטית.</Text>
          {waiting && (
            <Button
              title="בדיקת סטטוס התשלום"
              variant="secondary"
              size="md"
              onPress={async () => {
                const s = await api.getPaymentStatus(Number(p.paymentId));
                if (s.status === 'SUCCEEDED') finish({ type: s.type, id: s.targetId });
                else toast('התשלום עדיין לא אושר', 'info');
              }}
            />
          )}
        </Card>
      ) : (
        <>
          <CardPreview number={cardDigits} expiry={expiry} />
          <Card style={{ gap: 14 }}>
            <Field
              label="מספר כרטיס"
              icon="credit-card-outline"
              placeholder="0000 0000 0000 0000"
              keyboardType="number-pad"
              autoComplete="cc-number"
              value={card}
              onChangeText={(t) => setCard(t.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '))}
            />
            <Row gap={12}>
              <Field
                style={{ flex: 1 }}
                label="תוקף"
                placeholder="MM/YY"
                keyboardType="number-pad"
                value={expiry}
                onChangeText={(t) => {
                  const d = t.replace(/\D/g, '').slice(0, 4);
                  setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                }}
              />
              <Field style={{ flex: 1 }} label="CVV" placeholder="123" keyboardType="number-pad" secureTextEntry value={cvv} onChangeText={(t) => setCvv(t.replace(/\D/g, '').slice(0, 4))} />
            </Row>
            <View style={styles.demo}>
              <Text variant="small" color="#9A6700" align="center">
                מצב הדגמה - לא מתבצע חיוב אמיתי. אפשר להזין כל מספר.
              </Text>
            </View>
          </Card>
        </>
      )}

      <Row style={{ justifyContent: 'center' }} gap={16}>
        {(['shield-lock-outline', 'lock-check-outline', 'credit-card-check-outline'] as const).map((i) => (
          <MaterialCommunityIcons key={i} name={i} size={22} color={colors.textMuted} />
        ))}
      </Row>
      <Text variant="small" color={colors.textMuted} align="center">
        פרטי האשראי מועברים ישירות לחברת הסליקה בתקן PCI-DSS ואינם נשמרים אצלנו
      </Text>
    </Screen>
  );
}

function CardPreview({ number, expiry }: { number: string; expiry: string }) {
  const [w, setW] = useState(0);
  const groups = (number.padEnd(16, '•').match(/.{1,4}/g) ?? []).join('  ');
  return (
    <View style={[styles.card, shadows.lg]} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={['#1668E3', '#0B2C4B', '#04121F']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      {w > 0 && <Bubbles width={w} height={200} opacity={0.5} seed={2} />}
      <Row style={{ justifyContent: 'space-between' }}>
        <MaterialCommunityIcons name="contactless-payment" size={28} color={colors.onDarkSoft} />
        <View style={styles.chip} />
      </Row>
      <Text variant="h2" color="#fff" style={{ letterSpacing: 2, writingDirection: 'ltr', textAlign: 'center', fontFamily: fonts.medium }}>
        {groups}
      </Text>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="caption" color={colors.onDarkSoft}>
          {expiry || 'MM/YY'}
        </Text>
        <Text variant="caption" color={colors.onDarkSoft}>
          AQUA PAY
        </Text>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  timer: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 14 },
  card: { height: 190, borderRadius: radius.xl, overflow: 'hidden', padding: space.lg, justifyContent: 'space-between' },
  chip: { width: 42, height: 30, borderRadius: 6, backgroundColor: '#E9C46A', opacity: 0.9 },
  demo: { backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: 10 },
});
