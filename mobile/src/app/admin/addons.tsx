import { useState } from 'react';
import { View } from 'react-native';
import { api, type Addon } from '../../api';
import { Button } from '../../components/Button';
import { Field, Stepper, Toggle } from '../../components/Controls';
import { Card, Divider, ErrorState, Hero, Loader, Row, Screen } from '../../components/Layout';
import { Text } from '../../components/Text';
import { formatPrice } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useConfig } from '../../state/config';
import { Sheet, useFeedback } from '../../state/feedback';
import { colors, space } from '../../theme';

type Draft = Omit<Addon, 'sortOrder'> & { isNew?: boolean };

export default function AddonsAdmin() {
  const catalog = useAsync(() => api.getCatalog(), []);
  const { reload: reloadConfig } = useConfig();
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [price, setPrice] = useState('');

  async function save(d: Draft, priceValue = Number(price)) {
    // new add-ons get a generated code; existing ones keep theirs
    const code = d.isNew ? `A${Date.now().toString(36).toUpperCase()}` : d.code;
    try {
      catalog.setData(
        await api.saveAddon(code, {
          nameHe: d.nameHe.trim(),
          descriptionHe: d.descriptionHe,
          price: priceValue,
          durationMinutes: d.durationMinutes,
          isActive: d.isActive,
        }),
      );
      reloadConfig();
      setDraft(null);
      toast('התוספת נשמרה');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <Screen header={<Hero back eyebrow="ניהול" title="תוספות לשטיפה" subtitle="שירותים נוספים שהלקוח בוחר בזמן ההזמנה - מעלים את ההכנסה מכל רכב" compact />}>
      {catalog.loading ? (
        <Loader />
      ) : catalog.error ? (
        <ErrorState message={catalog.error} onRetry={catalog.reload} />
      ) : (
        <>
          <Button
            title="תוספת חדשה"
            icon="plus"
            onPress={() => {
              setPrice('');
              setDraft({ code: '', nameHe: '', descriptionHe: '', price: 0, durationMinutes: 10, isActive: true, isNew: true });
            }}
          />
          <Card padded={false}>
            {catalog.data?.addons.map((a, i) => (
              <View key={a.code}>
                {i > 0 && <Divider />}
                <Row style={{ padding: space.md, opacity: a.isActive ? 1 : 0.55 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{a.nameHe}</Text>
                    <Text variant="small" color={colors.textSoft}>
                      {formatPrice(a.price)} · +{a.durationMinutes} דק׳
                    </Text>
                  </View>
                  <Button
                    title="עריכה"
                    size="sm"
                    variant="ghost"
                    full={false}
                    onPress={() => {
                      setPrice(String(a.price));
                      setDraft({ ...a });
                    }}
                  />
                  <Toggle label={`הפעלת ${a.nameHe}`} value={a.isActive} onChange={(v) => save({ ...a, isActive: v }, a.price)} />
                </Row>
              </View>
            ))}
          </Card>
          <Text variant="small" color={colors.textMuted} align="center">
            הזמן הנוסף של כל תוספת נלקח בחשבון בחישוב השעות הפנויות.
          </Text>
        </>
      )}

      <Sheet visible={!!draft} onClose={() => setDraft(null)} title={draft?.isNew ? 'תוספת חדשה' : 'עריכת תוספת'}>
        {draft && (
          <>
            <Field label="שם" value={draft.nameHe} onChangeText={(t) => setDraft({ ...draft, nameHe: t })} maxLength={50} />
            <Field label="תיאור קצר" value={draft.descriptionHe ?? ''} onChangeText={(t) => setDraft({ ...draft, descriptionHe: t })} maxLength={200} />
            <Field label="מחיר (₪, כולל מע״מ)" keyboardType="decimal-pad" value={price} onChangeText={(t) => setPrice(t.replace(/[^\d.]/g, ''))} />
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">זמן נוסף</Text>
              <Stepper value={draft.durationMinutes} onChange={(v) => setDraft({ ...draft, durationMinutes: v })} step={5} min={0} max={240} suffix="דק׳" />
            </Row>
            <Button title="שמירה" onPress={() => (draft.nameHe.trim().length < 2 ? toast('יש להזין שם', 'error') : save(draft))} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
