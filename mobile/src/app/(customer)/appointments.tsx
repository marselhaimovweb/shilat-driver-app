import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, type Appointment } from '../../api';
import { Button } from '../../components/Button';
import { Chip, ChipRow, Field, Segmented, Stars } from '../../components/Controls';
import { AppointmentCard } from '../../components/Domain';
import { EmptyState, ErrorState, Hero, Loader, Row, Screen } from '../../components/Layout';
import { Text } from '../../components/Text';
import { minutesUntil } from '../../lib/dates';
import { formatPrice } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useConfig } from '../../state/config';
import { Sheet, useFeedback } from '../../state/feedback';
import { colors, fonts, radius, space } from '../../theme';

type HistoryFilter = 'all' | 'regular' | 'futureDone' | 'futureMissed';

const HISTORY_FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'regular', label: 'שטיפות רגילות' },
  { value: 'futureDone', label: 'עתידיים שבוצעו' },
  { value: 'futureMissed', label: 'עתידיים שלא בוצעו' },
];

export default function MyAppointments() {
  const { config } = useConfig();
  const { confirm, toast } = useFeedback();
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [reviewing, setReviewing] = useState<Appointment | null>(null);
  const upcoming = useAsync(() => api.listMyAppointments('upcoming'), []);
  const history = useAsync(() => api.listMyAppointments('history'), []);

  useFocusEffect(
    useCallback(() => {
      upcoming.reload();
      history.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const filtered = useMemo(() => {
    const list = history.data ?? [];
    switch (filter) {
      case 'regular':
        return list.filter((a) => a.bookingType === 'REGULAR');
      case 'futureDone':
        return list.filter((a) => a.bookingType === 'FUTURE' && a.status === 'COMPLETED');
      case 'futureMissed':
        return list.filter((a) => a.bookingType === 'FUTURE' && a.status !== 'COMPLETED');
      default:
        return list;
    }
  }, [history.data, filter]);

  const stats = useMemo(() => {
    const done = (history.data ?? []).filter((a) => a.status === 'COMPLETED');
    return { washes: done.length, spent: done.reduce((s, a) => s + Number(a.amountPaid), 0) };
  }, [history.data]);

  async function cancel(a: Appointment) {
    const hoursLeft = minutesUntil(a.date, a.time) / 60;
    const freeHours = config?.rules.cancelFreeHours ?? 24;
    const depositNote =
      a.depositStatus === 'PAID'
        ? hoursLeft >= freeHours
          ? `המקדמה (${formatPrice(a.depositAmount)}) תוחזר אליך במלואה.`
          : `שימו לב: הביטול פחות מ-${freeHours} שעות לפני התור - המקדמה לא תוחזר.`
        : undefined;
    const ok = await confirm({ title: 'לבטל את התור?', message: depositNote, confirmText: 'כן, לבטל', cancelText: 'השאר את התור', destructive: true });
    if (!ok) return;
    try {
      const res = await api.cancelMyAppointment(a.id);
      toast(res.refunded ? 'התור בוטל והמקדמה הוחזרה' : 'התור בוטל');
      upcoming.reload();
      history.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const active = tab === 'upcoming' ? upcoming : history;
  const list = tab === 'upcoming' ? (upcoming.data ?? []) : filtered;

  return (
    <Screen
      refreshing={active.refreshing}
      onRefresh={active.refresh}
      header={
        <Hero title="התורים שלי" compact>
          <Segmented
            tone="dark"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'upcoming', label: `קרובים${upcoming.data?.length ? ` (${upcoming.data.length})` : ''}`, icon: 'calendar-clock' },
              { value: 'history', label: 'היסטוריה', icon: 'history' },
            ]}
          />
        </Hero>
      }
    >
      {tab === 'history' && (
        <View style={{ gap: space.md, marginHorizontal: -space.lg }}>
          <Row style={{ paddingHorizontal: space.lg }} gap={space.sm}>
            <SummaryPill icon="car-wash" label="שטיפות" value={String(stats.washes)} />
            <SummaryPill icon="cash-multiple" label="סה״כ" value={formatPrice(stats.spent)} />
          </Row>
          <ChipRow>
            {HISTORY_FILTERS.map((f) => (
              <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
            ))}
          </ChipRow>
        </View>
      )}

      {active.loading ? (
        <Loader />
      ) : active.error ? (
        <ErrorState message={active.error} onRetry={active.reload} />
      ) : list.length === 0 ? (
        tab === 'upcoming' ? (
          <EmptyState title="אין תורים קרובים" message="הרכב שלך בטח מחכה לשטיפה טובה" action="לקביעת תור" onAction={() => router.push('/book')} />
        ) : (
          <EmptyState icon="history" title="אין עדיין היסטוריה" message="כאן יופיעו כל השטיפות שביצעת" />
        )
      ) : (
        list.map((a) => (
          <AppointmentCard
            key={a.id}
            appointment={a}
            footer={
              tab === 'upcoming' ? (
                <Row gap={10}>
                  {config?.features.CUSTOMER_CANCEL && ['CONFIRMED', 'PENDING_PAYMENT'].includes(a.status) && (
                    <Button title="ביטול תור" variant="ghost" size="sm" icon="close" full={false} onPress={() => cancel(a)} />
                  )}
                  {a.status === 'PENDING_PAYMENT' && (
                    <Text variant="small" color={colors.warning} style={{ flex: 1 }}>
                      התור ישוחרר אם המקדמה לא תשולם
                    </Text>
                  )}
                </Row>
              ) : a.status === 'COMPLETED' && config?.features.REVIEWS ? (
                a.rating ? (
                  <Row gap={8}>
                    <Stars value={a.rating} size={16} />
                    {a.reviewComment && (
                      <Text variant="small" color={colors.textSoft} numberOfLines={1} style={{ flex: 1 }}>
                        “{a.reviewComment}”
                      </Text>
                    )}
                  </Row>
                ) : (
                  <Pressable onPress={() => setReviewing(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="star-outline" size={18} color={colors.gold} />
                    <Text variant="small" weight={fonts.semibold} color={colors.cobalt}>
                      איך הייתה השטיפה? דרגו אותנו
                    </Text>
                  </Pressable>
                )
              ) : a.cancelReason ? (
                <Text variant="small" color={colors.textMuted}>
                  {a.cancelReason}
                </Text>
              ) : null
            }
          />
        ))
      )}

      <ReviewSheet
        appointment={reviewing}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null);
          toast('תודה על הדירוג!');
          history.reload();
        }}
      />
    </Screen>
  );
}

function SummaryPill({ icon, label, value }: { icon: 'car-wash' | 'cash-multiple'; label: string; value: string }) {
  return (
    <Row style={{ flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14 }} gap={10}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.cobalt} />
      <View>
        <Text variant="caption" color={colors.textMuted}>
          {label}
        </Text>
        <Text variant="h3">{value}</Text>
      </View>
    </Row>
  );
}

function ReviewSheet({ appointment, onClose, onDone }: { appointment: Appointment | null; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useFeedback();

  async function submit() {
    if (!appointment) return;
    setBusy(true);
    try {
      await api.reviewAppointment(appointment.id, rating, comment.trim() || undefined);
      setComment('');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={!!appointment} onClose={onClose} title="איך הייתה השטיפה?">
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Stars value={rating} onChange={setRating} size={40} />
        <Text color={colors.textSoft}>{['', 'לא טוב', 'בסדר', 'טוב', 'טוב מאוד', 'מושלם!'][rating]}</Text>
      </View>
      <Field placeholder="ספרו לנו עוד (לא חובה)" value={comment} onChangeText={setComment} multiline maxLength={500} />
      <Button title="שליחת דירוג" onPress={submit} loading={busy} />
    </Sheet>
  );
}
