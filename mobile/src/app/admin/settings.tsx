import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api, type AdminSettings } from '../../api';
import { Button, type IconName } from '../../components/Button';
import { Field, Stepper } from '../../components/Controls';
import { Card, Divider, ErrorState, Hero, IconBadge, Loader, Row, Screen, SectionTitle } from '../../components/Layout';
import { Text } from '../../components/Text';
import { useAsync } from '../../lib/useAsync';
import { useConfig } from '../../state/config';
import { useFeedback } from '../../state/feedback';
import { colors, space } from '../../theme';

type NumKey = Exclude<keyof AdminSettings, 'businessName' | 'businessPhone' | 'businessAddress' | 'announcementText'>;

const RULES: { key: NumKey; icon: IconName; title: string; text: string; step: number; min: number; max: number; suffix: string }[] = [
  { key: 'depositAmount', icon: 'cash-lock', title: 'סכום מקדמה לתור עתידי', text: 'נגבה בעת ההזמנה ומקוזז מהמחיר', step: 5, min: 0, max: 500, suffix: '₪' },
  { key: 'parallelBays', icon: 'garage-variant', title: 'עמדות שטיפה במקביל', text: 'כמה רכבים אפשר לשטוף באותו זמן', step: 1, min: 1, max: 20, suffix: '' },
  { key: 'slotIntervalMinutes', icon: 'timeline-clock-outline', title: 'מרווח בין תורים', text: 'כל כמה דקות מתחיל תור', step: 5, min: 5, max: 120, suffix: 'דק׳' },
  { key: 'futureMaxDays', icon: 'calendar-range', title: 'הזמנה מראש עד', text: 'כמה ימים קדימה אפשר לקבוע', step: 1, min: 1, max: 120, suffix: 'ימים' },
  { key: 'regularMinLeadMinutes', icon: 'clock-fast', title: 'זמן מינימום לתור להיום', text: 'כמה דקות מראש לפחות', step: 5, min: 0, max: 240, suffix: 'דק׳' },
  { key: 'cancelFreeHours', icon: 'cash-refund', title: 'ביטול עם החזר מקדמה', text: 'עד כמה שעות לפני התור', step: 1, min: 0, max: 168, suffix: 'שע׳' },
  { key: 'paymentHoldMinutes', icon: 'timer-sand', title: 'שמירת תור עד לתשלום', text: 'אחרי זה התור משתחרר', step: 5, min: 5, max: 60, suffix: 'דק׳' },
  { key: 'loyaltyPunchesForFree', icon: 'gift-outline', title: 'כרטיסיית מועדון', text: 'שטיפה חיצונית מתנה אחרי', step: 1, min: 2, max: 50, suffix: 'שטיפות' },
];

export default function SettingsAdmin() {
  const { toast } = useFeedback();
  const { reload: reloadConfig } = useConfig();
  const data = useAsync(() => api.getAdminSettings(), []);
  const [draft, setDraft] = useState<AdminSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data.data) setDraft(data.data.settings);
  }, [data.data]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await api.updateSettings(draft);
      setDraft(saved);
      reloadConfig();
      toast('ההגדרות נשמרו');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof AdminSettings>(k: K, v: AdminSettings[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <Screen
      header={<Hero back eyebrow="ניהול" title="חוקי הזמנה ופרטי העסק" compact />}
      footer={<Button title="שמירת הגדרות" icon="content-save-outline" onPress={save} loading={saving} disabled={!draft} />}
    >
      {data.loading || !draft ? (
        data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : <Loader />
      ) : (
        <>
          <SectionTitle title="חוקי הזמנה ומקדמות" />
          <Card padded={false}>
            {RULES.map((r, i) => (
              <View key={r.key}>
                {i > 0 && <Divider />}
                <Row style={{ padding: space.md }}>
                  <IconBadge icon={r.icon} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{r.title}</Text>
                    <Text variant="small" color={colors.textSoft}>
                      {r.text}
                    </Text>
                  </View>
                  <Stepper value={draft[r.key]} onChange={(v) => set(r.key, v)} step={r.step} min={r.min} max={r.max} suffix={r.suffix} />
                </Row>
              </View>
            ))}
          </Card>

          <SectionTitle title="פרטי העסק" />
          <Card style={{ gap: 14 }}>
            <Field label="שם העסק" icon="storefront-outline" value={draft.businessName} onChangeText={(t) => set('businessName', t)} />
            <Field label="טלפון" icon="phone-outline" keyboardType="phone-pad" value={draft.businessPhone} onChangeText={(t) => set('businessPhone', t)} />
            <Field label="כתובת" icon="map-marker-outline" value={draft.businessAddress} onChangeText={(t) => set('businessAddress', t)} />
          </Card>

          <SectionTitle title="הודעה ללקוחות" />
          <Card style={{ gap: 10 }}>
            <Field
              placeholder="למשל: סגורים בחג, מבצע השבוע..."
              value={draft.announcementText}
              onChangeText={(t) => set('announcementText', t)}
              multiline
              maxLength={300}
              hint='מוצג במסך הבית כשהמתג "הודעה ללקוחות" פעיל'
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
