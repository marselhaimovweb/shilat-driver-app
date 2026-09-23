import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { api } from '../../api';
import { Card, EmptyState, ErrorState, Hero, Loader, Row, Screen } from '../../components/Layout';
import { formatPrice2, OrderBadge } from '../../components/Store';
import { Text } from '../../components/Text';
import { useAsync } from '../../lib/useAsync';
import { colors } from '../../theme';

export default function MyOrders() {
  const orders = useAsync(() => api.listMyOrders(), []);
  useFocusEffect(
    useCallback(() => {
      orders.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <Screen refreshing={orders.refreshing} onRefresh={orders.refresh} header={<Hero back title="ההזמנות שלי" compact />}>
      {orders.loading ? (
        <Loader />
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={orders.reload} />
      ) : !orders.data?.length ? (
        <EmptyState icon="receipt" title="עוד אין הזמנות" action="לחנות" onAction={() => router.replace('/store')} />
      ) : (
        orders.data.map((o) => (
          <Card key={o.id} onPress={() => router.push({ pathname: '/orders/[id]', params: { id: String(o.id) } })} style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="h3">הזמנה #{o.id}</Text>
              <OrderBadge status={o.status} />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={6}>
                <MaterialCommunityIcons name={o.fulfillment === 'DELIVERY' ? 'truck-fast-outline' : 'store-outline'} size={18} color={colors.textSoft} />
                <Text variant="small" color={colors.textSoft}>
                  {new Date(o.createdAt).toLocaleDateString('he-IL')} · {o.itemCount} פריטים
                </Text>
              </Row>
              <View>
                <Text variant="bodyStrong">{formatPrice2(o.total)}</Text>
              </View>
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}
