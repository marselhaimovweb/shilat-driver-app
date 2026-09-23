import { View } from 'react-native';
import { api } from '../../api';
import { Stars } from '../../components/Controls';
import { Card, EmptyState, ErrorState, Hero, Loader, Row, Screen } from '../../components/Layout';
import { Text } from '../../components/Text';
import { formatDateShort } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import { colors, radius } from '../../theme';

export default function Reviews() {
  const reviews = useAsync(() => api.listReviews(), []);
  const list = reviews.data ?? [];
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: list.filter((r) => r.rating === n).length }));

  return (
    <Screen
      refreshing={reviews.refreshing}
      onRefresh={reviews.refresh}
      header={
        <Hero back eyebrow="מה אומרים עליכם" title="דירוגים" compact>
          {list.length > 0 && (
            <Row gap={16}>
              <View style={{ alignItems: 'center' }}>
                <Text variant="display" color="#fff">
                  {avg.toFixed(1)}
                </Text>
                <Stars value={Math.round(avg)} size={16} />
                <Text variant="caption" color={colors.onDarkSoft}>
                  {list.length} דירוגים
                </Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                {dist.map((d) => (
                  <Row key={d.n} gap={8}>
                    <Text variant="caption" color={colors.onDarkSoft} style={{ width: 10 }}>
                      {d.n}
                    </Text>
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.glass }}>
                      <View style={{ width: `${(d.count / list.length) * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.gold }} />
                    </View>
                  </Row>
                ))}
              </View>
            </Row>
          )}
        </Hero>
      }
    >
      {reviews.loading ? (
        <Loader />
      ) : reviews.error ? (
        <ErrorState message={reviews.error} onRetry={reviews.reload} />
      ) : list.length === 0 ? (
        <EmptyState icon="star-outline" title="עוד אין דירוגים" message="לקוחות יכולים לדרג שטיפה שהושלמה מתוך האפליקציה" />
      ) : (
        list.map((r) => (
          <Card key={r.id} style={{ gap: 8, padding: 16 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">{r.customerName || 'לקוח'}</Text>
              <Stars value={r.rating} size={16} />
            </Row>
            {r.comment && <Text color={colors.text}>“{r.comment}”</Text>}
            <Row gap={8}>
              <View style={{ backgroundColor: colors.mist, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text variant="caption" color={colors.textSoft}>
                  {r.serviceName}
                </Text>
              </View>
              <Text variant="caption" color={colors.textMuted}>
                {formatDateShort(r.createdAt.slice(0, 10))} · תור #{r.appointmentId}
              </Text>
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
