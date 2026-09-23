import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, type Appointment, type AppointmentFilters, type AppointmentStatus, type BookingType } from '../../../api';
import { QuickActions } from '../../../components/AdminActions';
import { Button } from '../../../components/Button';
import { Chip, ChipRow, Field, Segmented } from '../../../components/Controls';
import { AppointmentCard } from '../../../components/Domain';
import { EmptyState, ErrorState, Hero, Loader, Row, Screen } from '../../../components/Layout';
import { Text } from '../../../components/Text';
import { addDays, DAY_SHORT, dayOfMonth, dayOfWeek, formatDateLong, today } from '../../../lib/dates';
import { formatPrice } from '../../../lib/format';
import { colors, gradients, radius, space } from '../../../theme';

type Mode = 'day' | 'history';

const DAY_STATUS: { value: string; label: string; statuses?: AppointmentStatus[] }[] = [
  { value: 'all', label: 'הכל' },
  { value: 'open', label: 'פתוחים', statuses: ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] },
  { value: 'done', label: 'בוצעו', statuses: ['COMPLETED'] },
  { value: 'noshow', label: 'לא הגיעו', statuses: ['NO_SHOW'] },
  { value: 'cancelled', label: 'בוטלו', statuses: ['CANCELLED'] },
];

const HISTORY_VIEWS: { value: string; label: string; type?: BookingType; statuses?: AppointmentStatus[] }[] = [
  { value: 'all', label: 'כל ההיסטוריה' },
  { value: 'regular', label: 'שטיפות רגילות', type: 'REGULAR', statuses: ['COMPLETED'] },
  { value: 'futureDone', label: 'עתידיים שבוצעו', type: 'FUTURE', statuses: ['COMPLETED'] },
  { value: 'futureMissed', label: 'עתידיים שלא בוצעו', type: 'FUTURE', statuses: ['NO_SHOW', 'CANCELLED'] },
  { value: 'noshow', label: 'לא הגיעו', statuses: ['NO_SHOW'] },
];

export default function AdminAppointments() {
  const [mode, setMode] = useState<Mode>('day');
  const [date, setDate] = useState(today());
  const [type, setType] = useState<BookingType | 'all'>('all');
  const [dayStatus, setDayStatus] = useState('all');
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const filters = useMemo<AppointmentFilters>(() => {
    if (mode === 'day') {
      return {
        from: date,
        to: date,
        type: type === 'all' ? undefined : type,
        status: DAY_STATUS.find((s) => s.value === dayStatus)?.statuses,
        order: 'asc',
        pageSize: 200,
      };
    }
    const v = HISTORY_VIEWS.find((x) => x.value === view)!;
    return { to: today(), type: v.type, status: v.statuses, search: search.trim() || undefined, order: 'desc', pageSize: 30 };
  }, [mode, date, type, dayStatus, view, search]);

  const load = useCallback(
    async (nextPage = 1) => {
      const id = ++request.current;
      if (nextPage === 1) setLoading(true);
      try {
        const res = await api.listAppointments({ ...filters, page: nextPage });
        if (id !== request.current) return;
        setItems((prev) => (nextPage === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(nextPage);
        setError(null);
      } catch (e) {
        if (id === request.current) setError((e as Error).message);
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    const t = setTimeout(() => load(1), mode === 'history' ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, mode]);

  useFocusEffect(
    useCallback(() => {
      load(1);
    }, [load]),
  );

  const days = useMemo(() => Array.from({ length: 33 }, (_, i) => addDays(today(), i - 2)), []);
  const dayRevenue = items.filter((a) => a.status === 'COMPLETED').reduce((s, a) => s + Number(a.amountPaid), 0);

  return (
    <Screen
      header={
        <Hero title="יומן תורים" compact>
          <Segmented
            tone="dark"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'day', label: 'לפי יום', icon: 'calendar-today' },
              { value: 'history', label: 'היסטוריה וחיפוש', icon: 'history' },
            ]}
          />
        </Hero>
      }
    >
      {mode === 'day' ? (
        <View style={{ gap: space.md, marginHorizontal: -space.lg }}>
          <DayStrip days={days} value={date} onChange={setDate} />
          <View style={{ paddingHorizontal: space.lg }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="h3">{formatDateLong(date)}</Text>
              <Text variant="small" color={colors.textSoft}>
                {total} תורים · {formatPrice(dayRevenue)}
              </Text>
            </Row>
          </View>
          <ChipRow>
            {(['all', 'REGULAR', 'FUTURE'] as const).map((t) => (
              <Chip key={t} label={t === 'all' ? 'כל הסוגים' : t === 'REGULAR' ? 'רגילים' : 'עתידיים'} selected={type === t} onPress={() => setType(t)} />
            ))}
            <View style={{ width: 1, backgroundColor: colors.line, marginHorizontal: 4 }} />
            {DAY_STATUS.map((s) => (
              <Chip key={s.value} label={s.label} selected={dayStatus === s.value} onPress={() => setDayStatus(s.value)} />
            ))}
          </ChipRow>
        </View>
      ) : (
        <View style={{ gap: space.md, marginHorizontal: -space.lg }}>
          <View style={{ paddingHorizontal: space.lg }}>
            <Field icon="magnify" placeholder="חיפוש לפי שם, טלפון, מספר רכב או מס׳ תור" value={search} onChangeText={setSearch} />
          </View>
          <ChipRow>
            {HISTORY_VIEWS.map((v) => (
              <Chip key={v.value} label={v.label} selected={view === v.value} onPress={() => setView(v.value)} />
            ))}
          </ChipRow>
          <Text variant="small" color={colors.textSoft} style={{ paddingHorizontal: space.lg }}>
            נמצאו {total} תורים
          </Text>
        </View>
      )}

      {loading ? (
        <Loader />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(1)} />
      ) : items.length === 0 ? (
        <EmptyState icon="calendar-blank-outline" title="אין תורים להצגה" message={mode === 'day' ? 'אין תורים ביום זה לפי הסינון שנבחר' : 'נסו לשנות את החיפוש או הסינון'} />
      ) : (
        <>
          {items.map((a) => (
            <AppointmentCard
              key={a.id}
              appointment={a}
              showCustomer
              onPress={() => router.push({ pathname: '/admin/appointment/[id]', params: { id: String(a.id) } })}
              footer={mode === 'day' ? <QuickActions appointment={a} compact onChanged={() => load(1)} /> : undefined}
            />
          ))}
          {items.length < total && <Button title="טעינת תורים נוספים" variant="secondary" size="md" onPress={() => load(page + 1)} />}
        </>
      )}
    </Screen>
  );
}

function DayStrip({ days, value, onChange }: { days: string[]; value: string; onChange: (d: string) => void }) {
  const scroll = useRef<ScrollView>(null);
  return (
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.lg }}>
      {days.map((d) => {
        const on = d === value;
        const isToday = d === today();
        return (
          <Pressable key={d} onPress={() => onChange(d)} style={[styles.day, on && styles.dayOn]}>
            {on && <LinearGradient colors={gradients.deep} style={StyleSheet.absoluteFill} />}
            <Text variant="caption" color={on ? colors.aquaSoft : colors.textMuted}>
              {isToday ? 'היום' : DAY_SHORT[dayOfWeek(d)]}
            </Text>
            <Text variant="h3" color={on ? '#fff' : colors.text}>
              {dayOfMonth(d)}
            </Text>
            {isToday && !on && <View style={styles.todayDot} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  day: {
    width: 54,
    height: 66,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayOn: { borderColor: colors.navy },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.aqua },
});
