import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../../../api';
import { QuickActions } from '../../../components/AdminActions';
import { AppointmentCard, BarChart, StatTile } from '../../../components/Domain';
import { Card, EmptyState, ErrorState, Hero, Loader, Row, Screen, SectionTitle } from '../../../components/Layout';
import { Text } from '../../../components/Text';
import { DAY_SHORT, dayOfWeek, formatDateLong, nowLocal, toMinutes } from '../../../lib/dates';
import { formatPrice } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { useConfig } from '../../../state/config';
import { useSession } from '../../../state/session';
import { colors, fonts, radius, space } from '../../../theme';

export default function Dashboard() {
  const { session } = useSession();
  const { config, reload: reloadConfig } = useConfig();
  const dash = useAsync(() => api.getDashboard(), []);

  useFocusEffect(
    useCallback(() => {
      dash.reload();
      reloadConfig();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const d = dash.data;
  const f = config?.features;
  const now = nowLocal().minutes;
  const queue = (d?.queue ?? []).filter((a) => ['CONFIRMED', 'IN_PROGRESS', 'PENDING_PAYMENT'].includes(a.status));
  const nextUp = queue.filter((a) => a.status === 'IN_PROGRESS' || toMinutes(a.time) + a.durationMinutes >= now - 30);
  const noShowRate = d && d.periods.closed30 ? Math.round((d.periods.noShow30 / d.periods.closed30) * 100) : 0;

  return (
    <Screen
      refreshing={dash.refreshing}
      onRefresh={dash.refresh}
      header={
        <Hero eyebrow={formatDateLong(nowLocal().date)} title={`שלום, ${(session?.name ?? '').split(' ')[0] || 'מנהל'}`}>
          <Row gap={10}>
            <HeroKpi label="הכנסות היום" value={d ? formatPrice(d.today.revenueToday) : '—'} sub={d ? `צפי ${formatPrice(d.today.expectedToday)}` : ''} />
            <HeroKpi label="תורים היום" value={d ? String(d.today.totalToday) : '—'} sub={d ? `${d.today.regularToday} רגילים · ${d.today.futureToday} עתידיים` : ''} />
            <HeroKpi label="תפוסה" value={d ? `${d.occupancy}%` : '—'} sub="מהשעות הפנויות" />
          </Row>
        </Hero>
      }
    >
      {/* system status */}
      <Pressable onPress={() => router.push('/admin/systems')} style={[styles.status, { backgroundColor: f?.BOOKING_SYSTEM ? colors.successSoft : colors.dangerSoft }]}>
        <View style={[styles.dot, { backgroundColor: f?.BOOKING_SYSTEM ? colors.success : colors.danger }]} />
        <Text variant="bodyStrong" style={{ flex: 1 }} color={f?.BOOKING_SYSTEM ? '#087F5B' : colors.danger}>
          {f?.BOOKING_SYSTEM
            ? `מערכת התורים פעילה · ${[f.REGULAR_BOOKING && 'רגילים', f.FUTURE_BOOKING && 'עתידיים'].filter(Boolean).join(' + ') || 'אין סוגי תור פתוחים'}`
            : 'מערכת התורים כבויה - לקוחות לא יכולים להזמין'}
        </Text>
        <Text variant="small" color={colors.textSoft}>
          ניהול מתגים
        </Text>
        <MaterialCommunityIcons name="chevron-left" size={18} color={colors.textSoft} />
      </Pressable>

      {dash.loading ? (
        <Loader />
      ) : dash.error ? (
        <ErrorState message={dash.error} onRetry={dash.reload} />
      ) : d ? (
        <>
          <Row gap={space.sm}>
            <StatTile label="ממתינים" value={d.today.waitingToday} icon="clock-outline" />
            <StatTile label="בשטיפה" value={d.today.inProgressToday} icon="water" />
          </Row>
          <Row gap={space.sm} style={{ marginTop: -space.sm }}>
            <StatTile label="הושלמו" value={d.today.completedToday} icon="check-circle-outline" />
            <StatTile label="לא הגיעו" value={d.today.noShowToday} icon="account-cancel-outline" />
          </Row>

          <SectionTitle title="התור עכשיו" action="ליומן המלא" onAction={() => router.push('/admin/appointments')} />
          {nextUp.length === 0 ? (
            <Card>
              <EmptyState icon="coffee-outline" title="אין תורים פתוחים כרגע" message="זמן טוב להפסקת קפה או לקבל לקוח מזדמן" action="תור חדש" onAction={() => router.push('/admin/new')} />
            </Card>
          ) : (
            nextUp.slice(0, 4).map((a) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                showCustomer
                onPress={() => router.push({ pathname: '/admin/appointment/[id]', params: { id: String(a.id) } })}
                footer={<QuickActions appointment={a} compact onChanged={dash.reload} />}
              />
            ))
          )}

          <Card style={{ gap: space.md }}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text variant="h3">הכנסות - 7 ימים אחרונים</Text>
                <Text variant="small" color={colors.textSoft}>
                  שטיפות שהושלמו
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="h2" color={colors.cobalt}>
                  {formatPrice(d.periods.revenueWeek)}
                </Text>
                <Text variant="caption" color={colors.textMuted}>
                  החודש {formatPrice(d.periods.revenueMonth)}
                </Text>
              </View>
            </Row>
            <BarChart
              data={d.revenueSeries.map((s) => ({ label: DAY_SHORT[dayOfWeek(s.date)], value: s.revenue }))}
              formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(Math.round(v)))}
            />
          </Card>

          <SectionTitle title="מדדים עסקיים" action="לדוחות" onAction={() => router.push('/admin/reports')} />
          <Row gap={space.sm}>
            <StatTile tone="dark" label="מקדמות מוחזקות" value={formatPrice(d.periods.depositsHeld)} icon="shield-check-outline" hint="לתורים עתידיים" />
            <StatTile tone="aqua" label="תורים עתידיים" value={d.periods.futureBooked} icon="calendar-arrow-left" hint="נקבעו מראש" />
          </Row>
          <Row gap={space.sm} style={{ marginTop: -space.sm }}>
            <StatTile label="אי-הגעה (30 יום)" value={`${noShowRate}%`} icon="account-alert-outline" hint={`${d.periods.noShow30} מתוך ${d.periods.closed30}`} />
            <StatTile label="דירוג ממוצע" value={d.reviews.avgRating ? Number(d.reviews.avgRating).toFixed(1) : '—'} icon="star-outline" hint={`${d.reviews.reviewCount} דירוגים`} />
          </Row>
          <Row gap={space.sm} style={{ marginTop: -space.sm }}>
            <StatTile label="שטיפות החודש" value={d.periods.washesMonth} icon="car-wash" />
            <StatTile label="לקוחות חדשים" value={d.periods.newCustomersMonth} icon="account-plus-outline" hint="החודש" />
          </Row>
        </>
      ) : null}
    </Screen>
  );
}

function HeroKpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.kpi}>
      <Text variant="caption" color={colors.onDarkSoft}>
        {label}
      </Text>
      <Text variant="h1" color="#fff" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" color={colors.onDarkMuted} numberOfLines={2} style={{ fontFamily: fonts.regular }}>
        {sub}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpi: { flex: 1, backgroundColor: colors.glass, borderRadius: radius.lg, padding: 12, gap: 2, borderWidth: 1, borderColor: colors.glassLine },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
