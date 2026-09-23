import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, type PaymentSettings } from '../../api';
import { Button } from '../../components/Button';
import { Field, Toggle } from '../../components/Controls';
import { Card, ErrorState, Hero, Loader, Row, Screen, SectionTitle } from '../../components/Layout';
import { Text } from '../../components/Text';
import { useAsync } from '../../lib/useAsync';
import { useFeedback } from '../../state/feedback';
import { colors, radius } from '../../theme';

const FIELD_LABEL = { terminal: 'מספר מסוף / שם ספק (supplier)', apiUser: 'שם משתמש API (ApiName)', apiSecret: 'סיסמת API (לביצוע החזרים)' } as const;

/** Clearing company setup - owners only. The secret is stored encrypted and never shown again. */
export default function PaymentsAdmin() {
  const data = useAsync(() => api.getPaymentSettings(), []);
  const { toast, confirm } = useFeedback();
  const [form, setForm] = useState<Omit<PaymentSettings, 'hasSecret' | 'apiSecret'> | null>(null);
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data.data) {
      const { hasSecret: _h, apiSecret: _s, ...rest } = data.data.settings;
      setForm(rest);
    }
  }, [data.data]);

  const provider = data.data?.providers.find((p) => p.code === form?.provider);

  async function save() {
    if (!form) return;
    if (form.provider !== 'MOCK' && !form.testMode) {
      const ok = await confirm({
        title: 'להפעיל חיובים אמיתיים?',
        message: 'ודאו שביצעתם תשלום והחזר בדיקה במסוף הבדיקות של חברת הסליקה לפני המעבר למצב אמיתי.',
        confirmText: 'כן, להפעיל',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      data.setData(await api.savePaymentSettings({ ...form, apiSecret: secret || undefined }));
      setSecret('');
      toast('הגדרות הסליקה נשמרו');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      header={<Hero back eyebrow="אבטחה" title="סליקת אשראי" subtitle="בחירת חברת הסליקה לתשלום מקדמות והזמנות מהחנות" compact />}
      footer={<Button title="שמירה" icon="content-save-outline" onPress={save} loading={saving} disabled={!form} />}
    >
      {data.loading || !form ? (
        data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : <Loader />
      ) : (
        <>
          <SectionTitle title="חברת סליקה" />
          <View style={{ gap: 10 }}>
            {data.data!.providers.map((p) => {
              const on = form.provider === p.code;
              return (
                <Pressable
                  key={p.code}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setForm({ ...form, provider: p.code })}
                  style={[styles.option, on && styles.optionOn]}
                >
                  <MaterialCommunityIcons name={on ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={on ? colors.cobalt : colors.textMuted} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {provider && provider.fields.length > 0 && (
            <Card style={{ gap: 14 }}>
              {provider.fields.includes('terminal') && (
                <Field label={FIELD_LABEL.terminal} autoCapitalize="none" value={form.terminal} onChangeText={(t) => setForm({ ...form, terminal: t })} />
              )}
              {provider.fields.includes('apiUser') && (
                <Field label={FIELD_LABEL.apiUser} autoCapitalize="none" value={form.apiUser} onChangeText={(t) => setForm({ ...form, apiUser: t })} />
              )}
              {provider.fields.includes('apiSecret') && (
                <Field
                  label={FIELD_LABEL.apiSecret}
                  secureTextEntry
                  autoCapitalize="none"
                  value={secret}
                  onChangeText={setSecret}
                  placeholder={data.data!.settings.hasSecret ? `שמור (${data.data!.settings.apiSecret}) - השאירו ריק כדי לא לשנות` : ''}
                />
              )}
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">מצב בדיקות</Text>
                  <Text variant="small" color={colors.textSoft}>
                    מומלץ להשאיר פעיל עד שבדקתם תשלום והחזר
                  </Text>
                </View>
                <Toggle label="מצב בדיקות" value={form.testMode} onChange={(v) => setForm({ ...form, testMode: v })} />
              </Row>
            </Card>
          )}

          <Card style={{ gap: 8 }}>
            <Row>
              <MaterialCommunityIcons name="shield-lock-outline" size={22} color={colors.success} />
              <Text variant="bodyStrong">אבטחה</Text>
            </Row>
            <Text variant="small" color={colors.textSoft}>
              • הלקוח מקליד את פרטי האשראי בדף המאובטח של חברת הסליקה - הם לא עוברים דרך האפליקציה או השרת שלכם (תקן PCI-DSS).
            </Text>
            <Text variant="small" color={colors.textSoft}>• הסיסמה נשמרת מוצפנת במסד הנתונים ואינה מוצגת שוב.</Text>
            <Text variant="small" color={colors.textSoft}>• כל שינוי כאן נרשם ביומן הפעולות.</Text>
            <Text variant="small" color={colors.textSoft}>
              • כתובת ההודעות (Webhook) לחברת הסליקה: {'<כתובת השרת>'}/api/payments/webhook/{form.provider.toLowerCase()}
            </Text>
          </Card>
          {form.provider === 'MOCK' && (
            <View style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 12 }}>
              <Text variant="small" color="#9A6700">
                מצב הדגמה פעיל: הלקוחות רואים טופס תשלום לדוגמה ולא מתבצע חיוב. לפני עלייה לאוויר יש לבחור חברת סליקה.
              </Text>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  optionOn: { borderColor: colors.cobalt, backgroundColor: '#F5F9FF' },
});
