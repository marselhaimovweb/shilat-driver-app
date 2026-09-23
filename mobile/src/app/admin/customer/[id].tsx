import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { api } from '../../../api';
import { Button } from '../../../components/Button';
import { Chip, ChipRow, Field, Stepper, Toggle } from '../../../components/Controls';
import { AppointmentCard, Plate } from '../../../components/Domain';
import { Card, EmptyState, ErrorState, Hero, Loader, Row, Screen, SectionTitle } from '../../../components/Layout';
import { Text } from '../../../components/Text';
import { formatPhone, formatPrice } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { useConfig } from '../../../state/config';
import { useFeedback } from '../../../state/feedback';
import { colors, radius, space } from '../../../theme';

type Filter = 'all' | 'regular' | 'futureDone' | 'futureMissed';

export default function CustomerDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast, confirm } = useFeedback();
  const { config } = useConfig();
  const data = useAsync(() => api.getCustomer(Number(id)), [id]);
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (data.data) setNotes(data.data.adminNotes ?? '');
  }, [data.data]);

  const c = data.data;
  const stats = useMemo(() => {
    const list = c?.appointments ?? [];
    const done = list.filter((a) => a.status === 'COMPLETED');
    return {
      visits: done.length,
      spent: done.reduce((s, a) => s + Number(a.amountPaid), 0),
      noShows: list.filter((a) => a.status === 'NO_SHOW').length,
      avg: done.length ? done.reduce((s, a) => s + Number(a.amountPaid), 0) / done.length : 0,
    };
  }, [c]);

  const history = useMemo(() => {
    const list = c?.appointments ?? [];
    if (filter === 'regular') return list.filter((a) => a.bookingType === 'REGULAR');
    if (filter === 'futureDone') return list.filter((a) => a.bookingType === 'FUTURE' && a.status === 'COMPLETED');
    if (filter === 'futureMissed') return list.filter((a) => a.bookingType === 'FUTURE' && ['NO_SHOW', 'CANCELLED'].includes(a.status));
    return list;
  }, [c, filter]);

  async function update(patch: { isBlocked?: boolean; adminNotes?: string; loyaltyPunches?: number }, message: string) {
    await api.updateCustomer(Number(id), patch);
    toast(message);
    data.reload();
  }

  return (
    <Screen
      header={
        <Hero back eyebrow="כרטיס לקוח" title={c?.fullName || 'לקוח'} subtitle={c ? formatPhone(c.phone) : undefined} compact>
          {c && (
            <Row gap={10}>
              <Button title="התקשרות" icon="phone" variant="glass" size="sm" full={false} onPress={() => Linking.openURL(`tel:${c.phone}`)} />
              <Button title="WhatsApp" icon="whatsapp" variant="glass" size="sm" full={false} onPress={() => Linking.openURL(`https://wa.me/972${c.phone.slice(1)}`)} />
            </Row>
          )}
        </Hero>
      }
    >
      {data.loading ? (
        <Loader />
      ) : data.error || !c ? (
        <ErrorState message={data.error ?? 'לא נמצא'} onRetry={data.reload} />
      ) : (
        <>
          <Row gap={space.sm}>
            <Mini label="ביקורים" value={String(stats.visits)} />
            <Mini label="סה״כ הכנסות" value={formatPrice(stats.spent)} />
            <Mini label="ממוצע" value={formatPrice(stats.avg)} />
            <Mini label="לא הגיע" value={String(stats.noShows)} warn={stats.noShows > 0} />
          </Row>

          {c.vehicles.length > 0 && (
            <Card style={{ gap: 10 }}>
              <Text variant="h3">רכבים</Text>
              <Row gap={10} style={{ flexWrap: 'wrap' }}>
                {c.vehicles.map((v) => (
                  <Plate key={v.id} number={v.plateNumber} />
                ))}
              </Row>
            </Card>
          )}

          <Card style={{ gap: 14 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">חסימת לקוח</Text>
                <Text variant="small" color={colors.textSoft}>
                  לקוח חסום לא יוכל לקבוע תורים באפליקציה
                </Text>
              </View>
              <Toggle
                value={c.isBlocked}
                onChange={async (v) => {
                  if (v && !(await confirm({ title: 'לחסום את הלקוח?', confirmText: 'חסימה', destructive: true }))) return;
                  update({ isBlocked: v }, v ? 'הלקוח נחסם' : 'החסימה הוסרה');
                }}
              />
            </Row>
            {config?.features.LOYALTY_PROGRAM && (
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">כרטיסיית מועדון</Text>
                  <Text variant="small" color={colors.textSoft}>
                    ניקובים שנצברו (מתוך {config.rules.loyaltyPunchesForFree})
                  </Text>
                </View>
                <Stepper value={c.loyaltyPunches} min={0} max={100} onChange={(v) => update({ loyaltyPunches: v }, 'הכרטיסייה עודכנה')} />
              </Row>
            )}
            <Field label="הערות על הלקוח" placeholder="למשל: מעדיף ריח וניל, רכב עם שריטה בדלת" value={notes} onChangeText={setNotes} multiline maxLength={500} />
            <Button title="שמירת הערות" variant="secondary" size="md" onPress={() => update({ adminNotes: notes }, 'ההערות נשמרו')} />
          </Card>

          <SectionTitle title="היסטוריית תורים" />
          <View style={{ marginHorizontal: -space.lg }}>
            <ChipRow>
              <Chip label="הכל" selected={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="שטיפות רגילות" selected={filter === 'regular'} onPress={() => setFilter('regular')} />
              <Chip label="עתידיים שבוצעו" selected={filter === 'futureDone'} onPress={() => setFilter('futureDone')} />
              <Chip label="עתידיים שלא בוצעו" selected={filter === 'futureMissed'} onPress={() => setFilter('futureMissed')} />
            </ChipRow>
          </View>
          {history.length === 0 ? (
            <EmptyState icon="history" title="אין תורים להצגה" />
          ) : (
            history.map((a) => (
              <AppointmentCard key={a.id} appointment={a} onPress={() => router.push({ pathname: '/admin/appointment/[id]', params: { id: String(a.id) } })} />
            ))
          )}
        </>
      )}
    </Screen>
  );
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: warn ? colors.dangerSoft : colors.surface, borderRadius: radius.md, padding: 10, gap: 2 }}>
      <Text variant="caption" color={warn ? colors.danger : colors.textMuted}>
        {label}
      </Text>
      <Text variant="bodyStrong" color={warn ? colors.danger : colors.text} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}
