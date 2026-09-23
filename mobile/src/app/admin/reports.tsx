import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../api';
import { Segmented } from '../../components/Controls';
import { BarChart, ShareBar, StatTile } from '../../components/Domain';
import { Card, Divider, ErrorState, Hero, InfoLine, Loader, Row, Screen, SectionTitle } from '../../components/Layout';
import { Text } from '../../components/Text';
import { addDays, formatDateShort, today } from '../../lib/dates';
import { formatPhone, formatPrice } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { colors, space } from '../../theme';

type Range = '7' | '30' | '90';

export default function Reports() {
  const [range, setRange] = useState<Range>('30');
  const to = today();
  const from = addDays(to, -(Number(range) - 1));
  const report = useAsync(() => api.getReport(from, to), [from, to]);
  const r = report.data;
  const s = r?.summary;
  const closed = s ? s.completed + s.noShow : 0;

  return (
    <Screen
      refreshing={report.refreshing}
      onRefresh={report.refresh}
      header={
        <Hero back eyebrow={`${formatDateShort(from)} - ${formatDateShort(to)}`} title="דוחות" compact>
          <Segmented
            tone="dark"
            value={range}
            onChange={setRange}
            options={[
              { value: '7', label: '7 ימים' },
              { value: '30', label: '30 ימים' },
              { value: '90', label: '90 ימים' },
            ]}
          />
        </Hero>
      }
    >
      {report.loading ? (
        <Loader />
      ) : report.error ? (
        <ErrorState message={report.error} onRetry={report.reload} />
      ) : r && s ? (
        <>
          <Row gap={space.sm}>
            <StatTile tone="dark" label="הכנסות" value={formatPrice(s.revenue)} icon="cash-multiple" hint={`ממוצע לשטיפה ${formatPrice(s.completed ? s.revenue / s.completed : 0)}`} />
            <StatTile tone="aqua" label="שטיפות שבוצעו" value={s.completed} icon="car-wash" hint={`מתוך ${s.total} תורים`} />
          </Row>

          <Card style={{ gap: space.md }}>
            <Text variant="h3">הכנסות לפי יום</Text>
            <BarChart
              height={140}
              highlightLast={false}
              data={groupWeeks(r.byDay).map((d) => ({ label: d.label, value: d.revenue }))}
              formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(Math.round(v)))}
            />
          </Card>

          <SectionTitle title="תורים רגילים מול עתידיים" />
          <Card style={{ gap: 4 }}>
            <InfoLine icon="lightning-bolt" label="שטיפות רגילות שבוצעו" value={String(s.regularCompleted)} />
            <InfoLine icon="calendar-check" label="תורים עתידיים שבוצעו" value={String(s.futureCompleted)} />
            <InfoLine icon="calendar-remove" label="תורים עתידיים שלא בוצעו" value={String(s.futureNotCompleted)} />
            <Divider style={{ marginVertical: 8 }} />
            <InfoLine icon="account-cancel-outline" label="אי-הגעה" value={`${s.noShow} (${closed ? Math.round((s.noShow / closed) * 100) : 0}%)`} />
            <InfoLine icon="close-circle-outline" label="ביטולים" value={String(s.cancelled)} />
          </Card>

          <SectionTitle title="מקדמות" />
          <Card style={{ gap: 4 }}>
            <InfoLine icon="shield-check-outline" label="נגבו" value={formatPrice(s.depositsCollected)} />
            <InfoLine icon="cash-refund" label="הוחזרו" value={formatPrice(s.depositsRefunded)} />
            <InfoLine icon="cash-lock" label="חולטו (אי-הגעה / ביטול מאוחר)" value={formatPrice(s.depositsForfeited)} strong />
            {s.discounts > 0 && <InfoLine icon="sale" label="הנחות שניתנו" value={formatPrice(s.discounts)} />}
          </Card>

          <SectionTitle title="לפי שירות" />
          <Card style={{ gap: 14 }}>
            {r.byService.map((x) => (
              <ShareBar key={x.name} label={x.name} value={x.revenue} total={s.revenue} detail={`${x.washes} שטיפות · ${formatPrice(x.revenue)}`} />
            ))}
          </Card>

          <SectionTitle title="לפי סוג רכב" />
          <Card style={{ gap: 14 }}>
            {r.byVehicle.map((x) => (
              <ShareBar key={x.name} label={x.name} value={x.revenue} total={s.revenue} detail={`${x.washes} שטיפות · ${formatPrice(x.revenue)}`} />
            ))}
          </Card>

          <SectionTitle title="שעות עומס" />
          <Card style={{ gap: space.md }}>
            <Text variant="small" color={colors.textSoft}>
              כמות תורים לפי שעת התחלה - לתכנון כוח אדם
            </Text>
            <BarChart highlightLast={false} data={r.byHour.map((h) => ({ label: String(h.hour), value: h.washes }))} />
          </Card>

          <SectionTitle title="לקוחות מובילים" />
          <Card padded={false}>
            {r.topCustomers.map((c, i) => (
              <View key={c.id}>
                {i > 0 && <Divider />}
                <Row style={{ padding: space.md }}>
                  <Text variant="h3" color={i < 3 ? colors.gold : colors.textMuted} style={{ width: 24 }}>
                    {i + 1}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{c.fullName || 'ללא שם'}</Text>
                    <Text variant="small" color={colors.textSoft}>
                      {formatPhone(c.phone)} · {c.washes} שטיפות
                    </Text>
                  </View>
                  <Text variant="h3">{formatPrice(c.revenue)}</Text>
                </Row>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

/** Buckets daily rows into up to ~8 groups so long ranges stay readable. */
function groupWeeks(days: { date: string; revenue: number }[]) {
  if (days.length <= 8) return days.map((d) => ({ label: formatDateShort(d.date), revenue: d.revenue }));
  const size = Math.ceil(days.length / 8);
  const out: { label: string; revenue: number }[] = [];
  for (let i = 0; i < days.length; i += size) {
    const chunk = days.slice(i, i + size);
    out.push({ label: formatDateShort(chunk[0].date), revenue: chunk.reduce((s, d) => s + Number(d.revenue), 0) });
  }
  return out;
}
