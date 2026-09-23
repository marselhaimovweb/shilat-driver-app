import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, type BusinessHour } from '../../api';
import { Button } from '../../components/Button';
import { Field, Toggle } from '../../components/Controls';
import { Card, Divider, EmptyState, ErrorState, Hero, Loader, Row, Screen, SectionTitle } from '../../components/Layout';
import { Text } from '../../components/Text';
import { DAY_NAMES, formatDateLong, isValidDate, toMinutes, toTime } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import { useConfig } from '../../state/config';
import { Sheet, useFeedback } from '../../state/feedback';
import { colors, radius, space } from '../../theme';

export default function Hours() {
  const { toast, confirm } = useFeedback();
  const { reload: reloadConfig } = useConfig();
  const data = useAsync(() => api.getAdminSettings(), []);
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (data.data) setHours(data.data.businessHours);
  }, [data.data]);

  const update = (day: number, patch: Partial<BusinessHour>) => setHours((list) => list.map((h) => (h.dayOfWeek === day ? { ...h, ...patch } : h)));
  const shift = (time: string | null, delta: number) => toTime(Math.min(23 * 60 + 30, Math.max(0, toMinutes(time ?? '08:00') + delta)));

  async function save() {
    setSaving(true);
    try {
      await api.updateBusinessHours(hours);
      reloadConfig();
      toast('שעות הפעילות נשמרו');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeClosed(date: string) {
    if (!(await confirm({ title: 'לפתוח מחדש את התאריך?', message: formatDateLong(date), confirmText: 'הסרת סגירה' }))) return;
    const closedDates = await api.removeClosedDate(date);
    data.setData((d) => (d ? { ...d, closedDates } : d));
    reloadConfig();
  }

  return (
    <Screen
      header={<Hero back eyebrow="ניהול" title="שעות פעילות וחגים" compact />}
      footer={<Button title="שמירת שעות פעילות" icon="content-save-outline" onPress={save} loading={saving} />}
    >
      {data.loading ? (
        <Loader />
      ) : data.error ? (
        <ErrorState message={data.error} onRetry={data.reload} />
      ) : (
        <>
          <SectionTitle title="שבוע קבוע" />
          <Card padded={false}>
            {hours.map((h, i) => (
              <View key={h.dayOfWeek}>
                {i > 0 && <Divider />}
                <View style={{ padding: space.md, gap: 10 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="bodyStrong">יום {DAY_NAMES[h.dayOfWeek]}</Text>
                    <Row gap={10}>
                      <Text variant="small" color={h.isOpen ? colors.success : colors.textMuted}>
                        {h.isOpen ? 'פתוח' : 'סגור'}
                      </Text>
                      <Toggle
                        value={h.isOpen}
                        onChange={(v) => update(h.dayOfWeek, { isOpen: v, openTime: h.openTime ?? '08:00', closeTime: h.closeTime ?? '18:00' })}
                      />
                    </Row>
                  </Row>
                  {h.isOpen && (
                    <Row gap={10}>
                      <TimeBox label="פתיחה" value={h.openTime ?? '08:00'} onChange={(d) => update(h.dayOfWeek, { openTime: shift(h.openTime, d) })} />
                      <TimeBox label="סגירה" value={h.closeTime ?? '18:00'} onChange={(d) => update(h.dayOfWeek, { closeTime: shift(h.closeTime, d) })} />
                    </Row>
                  )}
                </View>
              </View>
            ))}
          </Card>

          <SectionTitle title="ימים סגורים (חגים, חופשות)" action="הוספה" onAction={() => setAdding(true)} />
          <Card padded={false}>
            {data.data?.closedDates.length ? (
              data.data.closedDates.map((c, i) => (
                <View key={c.date}>
                  {i > 0 && <Divider />}
                  <Row style={{ padding: space.md }}>
                    <MaterialCommunityIcons name="calendar-remove" size={22} color={colors.danger} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{formatDateLong(c.date)}</Text>
                      {c.reason && (
                        <Text variant="small" color={colors.textSoft}>
                          {c.reason}
                        </Text>
                      )}
                    </View>
                    <Pressable onPress={() => removeClosed(c.date)} hitSlop={8}>
                      <MaterialCommunityIcons name="close-circle-outline" size={22} color={colors.textMuted} />
                    </Pressable>
                  </Row>
                </View>
              ))
            ) : (
              <EmptyState icon="calendar-check-outline" title="אין ימי סגירה מתוכננים" action="הוספת יום סגור" onAction={() => setAdding(true)} />
            )}
          </Card>
        </>
      )}

      <AddClosedDate
        visible={adding}
        onClose={() => setAdding(false)}
        onAdded={(closedDates) => {
          data.setData((d) => (d ? { ...d, closedDates } : d));
          reloadConfig();
          setAdding(false);
          toast('היום נסגר להזמנות');
        }}
      />
    </Screen>
  );
}

function TimeBox({ label, value, onChange }: { label: string; value: string; onChange: (deltaMinutes: number) => void }) {
  return (
    <View style={styles.timeBox}>
      <Text variant="caption" color={colors.textMuted}>
        {label}
      </Text>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => onChange(30)} hitSlop={6} style={styles.timeBtn}>
          <MaterialCommunityIcons name="plus" size={16} color={colors.navy} />
        </Pressable>
        <Text variant="h3">{value}</Text>
        <Pressable onPress={() => onChange(-30)} hitSlop={6} style={styles.timeBtn}>
          <MaterialCommunityIcons name="minus" size={16} color={colors.navy} />
        </Pressable>
      </Row>
    </View>
  );
}

function AddClosedDate({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (list: { date: string; reason: string | null }[]) => void }) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add() {
    // accept DD/MM/YYYY as typed in Israel
    const m = date.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
    if (!isValidDate(iso)) return setError('הזינו תאריך בפורמט DD/MM/YYYY');
    try {
      onAdded(await api.addClosedDate(iso, reason.trim() || undefined));
      setDate('');
      setReason('');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="סגירת יום להזמנות">
      <Field label="תאריך" icon="calendar" placeholder="DD/MM/YYYY" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" error={error} />
      <Field label="סיבה (תוצג ללקוחות)" icon="text" placeholder="למשל: ראש השנה" value={reason} onChangeText={setReason} />
      <Button title="סגירת היום" icon="calendar-remove" onPress={add} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  timeBox: { flex: 1, backgroundColor: colors.mist, borderRadius: radius.md, padding: 10, gap: 6 },
  timeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
