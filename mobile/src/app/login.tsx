import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { api } from '../api';
import { Button } from '../components/Button';
import { Checkbox, Field } from '../components/Controls';
import { LegalLink } from '../components/Legal';
import { Card, Hero, Screen } from '../components/Layout';
import { Text } from '../components/Text';
import { formatPhone } from '../lib/format';
import { useFeedback } from '../state/feedback';
import { useSession } from '../state/session';
import { colors, fonts, radius } from '../theme';

type Step = 'phone' | 'code' | 'name';

export default function Login() {
  const { signIn } = useSession();
  const { toast } = useFeedback();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<string | undefined>();
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const codeInput = useRef<TextInput>(null);

  const digits = phone.replace(/\D/g, '');

  async function sendCode() {
    setError(null);
    if (!/^05\d{8}$/.test(digits)) return setError('הזינו מספר נייד בן 10 ספרות שמתחיל ב-05');
    setBusy(true);
    try {
      const res = await api.requestOtp(digits);
      setDevCode(res.devCode);
      setStep('code');
      setTimeout(() => codeInput.current?.focus(), 250);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    if (value.length !== 4) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.verifyOtp(digits, value);
      const adminRole = res.customer.role && res.customer.role !== 'CUSTOMER' ? res.customer.role : undefined;
      if (!res.customer.fullName) {
        setPendingToken(res.token);
        setPendingRole(adminRole);
        setStep('name');
      } else {
        await signIn({ token: res.token, role: 'customer', name: res.customer.fullName, adminRole });
        const pending = await api.getPendingConsents().catch(() => []);
        router.replace(pending.length ? '/consent' : '/');
      }
    } catch (e) {
      setError((e as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    if (name.trim().length < 2) return setError('איך נקרא לך? לפחות 2 אותיות');
    if (!agreed) return setError('יש לאשר את התקנון ומדיניות הפרטיות');
    setBusy(true);
    try {
      await signIn({ token: pendingToken!, role: 'customer', name: name.trim(), adminRole: pendingRole as never });
      await api.updateMe({ fullName: name.trim(), marketingOptIn: marketing });
      await api.acceptConsents(['TERMS', 'PRIVACY']);
      toast(`ברוכים הבאים, ${name.trim()}!`);
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Step, [string, string]> = {
    phone: ['כניסה מהירה', 'נשלח אליך קוד אימות ב-SMS. בלי סיסמאות.'],
    code: ['הזינו את הקוד', `שלחנו קוד בן 4 ספרות למספר ${formatPhone(digits)}`],
    name: ['נעים להכיר!', 'איך לקרוא לך? כך נזהה אותך כשתגיע לשטיפה'],
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<Hero back title={titles[step][0]} subtitle={titles[step][1]} compact />}>
        <Card style={{ gap: 18 }}>
          {step === 'phone' && (
            <>
              <Field
                label="מספר טלפון נייד"
                icon="cellphone"
                placeholder="050-0000000"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={12}
                autoFocus
                error={error}
                onSubmitEditing={sendCode}
              />
              <Button title="שלחו לי קוד" icon="message-text-outline" onPress={sendCode} loading={busy} />
              <Text variant="small" color={colors.textMuted}>
                המספר משמש לזיהוי ולשליחת הודעות על התורים וההזמנות. פרטים ב<LegalLink docKey="PRIVACY">מדיניות הפרטיות</LegalLink>.
              </Text>
              {api.mode === 'demo' && (
                <View style={styles.devCode}>
                  <Text variant="small" color={colors.ocean} align="center">
                    מצב הדגמה: 052-1234567 = בעלת העסק (רואה את תפריט הניהול). כל מספר אחר = לקוח רגיל.
                  </Text>
                </View>
              )}
            </>
          )}

          {step === 'code' && (
            <>
              <Pressable onPress={() => codeInput.current?.focus()} style={styles.codeRow}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={[styles.codeBox, code.length === i && styles.codeBoxActive, !!error && { borderColor: colors.danger }]}>
                    <Text variant="h1" color={colors.navy}>
                      {code[i] ?? ''}
                    </Text>
                  </View>
                ))}
              </Pressable>
              <TextInput
                ref={codeInput}
                value={code}
                onChangeText={(t) => {
                  const v = t.replace(/\D/g, '').slice(0, 4);
                  setCode(v);
                  if (v.length === 4) verify(v);
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={4}
                style={styles.hiddenInput}
              />
              {error && (
                <Text color={colors.danger} align="center">
                  {error}
                </Text>
              )}
              {devCode && (
                <View style={styles.devCode}>
                  <Text variant="small" color={colors.ocean} align="center">
                    {api.mode === 'demo' ? 'מצב הדגמה' : 'מצב פיתוח'} - הקוד שלך:{' '}
                    <Text variant="small" weight={fonts.bold} color={colors.ocean}>
                      {devCode}
                    </Text>
                  </Text>
                </View>
              )}
              <Button title="אימות וכניסה" onPress={() => verify()} loading={busy} disabled={code.length !== 4} />
              <Pressable onPress={() => setStep('phone')} style={{ alignSelf: 'center' }} hitSlop={8}>
                <Text variant="small" color={colors.cobalt}>
                  שינוי מספר / שליחה מחדש
                </Text>
              </Pressable>
            </>
          )}

          {step === 'name' && (
            <>
              <Field label="שם מלא" icon="account-outline" placeholder="ישראל ישראלי" value={name} onChangeText={setName} autoFocus error={error} />
              <Checkbox checked={agreed} onChange={setAgreed}>
                <Text>
                  קראתי ואני מסכים/ה ל<LegalLink docKey="TERMS">תקנון</LegalLink> ול<LegalLink docKey="PRIVACY">מדיניות הפרטיות</LegalLink>
                </Text>
              </Checkbox>
              <Checkbox checked={marketing} onChange={setMarketing}>
                <Text color={colors.textSoft}>לא חובה: אשמח לקבל עדכונים ומבצעים (אפשר להסיר בכל עת)</Text>
              </Checkbox>
              <Button title="בואו נתחיל" icon="arrow-left" iconPosition="end" onPress={saveName} loading={busy} />
            </>
          )}
        </Card>
        <Text variant="small" color={colors.textMuted} align="center">
          <LegalLink docKey="TERMS">תקנון</LegalLink> · <LegalLink docKey="PRIVACY">פרטיות</LegalLink> · <LegalLink docKey="ACCESSIBILITY">הצהרת נגישות</LegalLink>
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  codeRow: { flexDirection: 'row-reverse', justifyContent: 'center', gap: 12 },
  codeBox: {
    width: 62,
    height: 70,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxActive: { borderColor: colors.cobalt, backgroundColor: colors.surface },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  devCode: { backgroundColor: colors.foam, borderRadius: radius.sm, padding: 10 },
});
