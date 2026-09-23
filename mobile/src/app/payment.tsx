import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { api } from '../api';
import { Button } from '../components/Button';
import { Field } from '../components/Controls';
import { Card, Hero, Row, Screen } from '../components/Layout';
import { Text } from '../components/Text';
import { Bubbles } from '../components/Water';
import { formatPrice } from '../lib/format';
import { useFeedback } from '../state/feedback';
import { colors, fonts, radius, shadows, space } from '../theme';

/*
 * Deposit payment for a future booking.
 * - demo / mock provider: an in-app card form (nothing is charged)
 * - real provider: opens the clearing company's hosted page (checkout URL)
 */
export default function Payment() {
  const p = useLocalSearchParams<{ paymentId: string; appointmentId: string; amount: string; hold: string; url?: string }>();
  const { toast } = useFeedback();
  const amount = Number(p.amount);
  const [secondsLeft, setSecondsLeft] = useState(Number(p.hold || 15) * 60);
  const [card, setCard] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const cardDigits = card.replace(/\D/g, '');
  const valid = cardDigits.length >= 8 && /^\d{2}\/?\d{2}$/.test(expiry.replace(/\s/g, '')) && cvv.length >= 3;

  async function pay() {
    setBusy(true);
    try {
      await api.confirmDemoPayment(Number(p.paymentId));
      router.replace({ pathname: '/booking-success', params: { id: p.appointmentId } });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const expired = secondsLeft === 0;

  return (
    <Screen
      header={<Hero back eyebrow="תשלום מאובטח" title={`מקדמה ${formatPrice(amount)}`} subtitle="המקדמה מקוזזת מהמחיר ביום השטיפה" compact />}
      footer={
        p.url ? (
          <Button title="מעבר לדף התשלום המאובטח" icon="open-in-new" onPress={() => Linking.openURL(p.url!)} disabled={expired} />
        ) : (
          <Button title={`תשלום ${formatPrice(amount)}`} icon="lock" onPress={pay} loading={busy} disabled={!valid || expired} />
        )
      }
    >
      <Row style={[styles.timer, expired && { backgroundColor: colors.dangerSoft }]}>
        <MaterialCommunityIcons name="timer-sand" size={20} color={expired ? colors.danger : colors.warning} />
        <Text style={{ flex: 1 }} color={colors.text}>
          {expired ? 'זמן השריון הסתיים - יש לקבוע את התור מחדש' : 'השעה שמורה עבורך למשך'}
        </Text>
        {!expired && (
          <Text variant="h3" color={colors.warning} style={{ fontVariant: ['tabular-nums'] }}>
            {mm}:{ss}
          </Text>
        )}
      </Row>

      {!p.url && (
        <>
          <CardPreview number={cardDigits} expiry={expiry} />
          <Card style={{ gap: 14 }}>
            <Field
              label="מספר כרטיס"
              icon="credit-card-outline"
              placeholder="0000 0000 0000 0000"
              keyboardType="number-pad"
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
            {api.mode === 'demo' && (
              <View style={styles.demo}>
                <Text variant="small" color="#9A6700" align="center">
                  מצב הדגמה - לא מתבצע חיוב אמיתי. אפשר להזין כל מספר.
                </Text>
              </View>
            )}
          </Card>
        </>
      )}

      <Row style={{ justifyContent: 'center' }} gap={16}>
        {['shield-lock-outline', 'lock-check-outline', 'credit-card-check-outline'].map((i) => (
          <MaterialCommunityIcons key={i} name={i as 'lock-check-outline'} size={22} color={colors.textMuted} />
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
    <View style={[styles.card, shadows.lg]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
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
