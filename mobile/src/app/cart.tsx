import { router } from 'expo-router';
import { View } from 'react-native';
import { api } from '../api';
import { Button, IconButton } from '../components/Button';
import { Stepper } from '../components/Controls';
import { Card, Divider, EmptyState, Hero, InfoLine, Loader, Row, Screen } from '../components/Layout';
import { formatPrice2, ProductImage } from '../components/Store';
import { Text } from '../components/Text';
import { formatPrice } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { useCart } from '../state/cart';
import { useConfig } from '../state/config';
import { colors, space } from '../theme';

export default function Cart() {
  const cart = useCart();
  const { config } = useConfig();
  const store = useAsync(() => api.getStore(), []);

  const lines = cart.lines
    .map((l) => ({ ...l, product: store.data?.products.find((p) => p.id === l.productId) }))
    .filter((l) => l.product);
  const subtotal = lines.reduce((s, l) => s + l.product!.price * l.quantity, 0);
  const freeFrom = config?.rules.storeFreeDeliveryFrom ?? 0;
  const missing = Math.max(0, freeFrom - subtotal);
  const unavailable = cart.lines.length - lines.length;

  return (
    <Screen
      header={<Hero back title="סל הקניות" subtitle={cart.count ? `${cart.count} פריטים` : undefined} compact />}
      footer={
        lines.length ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text color={colors.textSoft}>סכום ביניים (כולל מע״מ)</Text>
              <Text variant="h2">{formatPrice2(subtotal)}</Text>
            </Row>
            <Button title="המשך לתשלום" icon="arrow-left" iconPosition="end" onPress={() => router.push('/checkout')} />
          </>
        ) : undefined
      }
    >
      {store.loading ? (
        <Loader />
      ) : lines.length === 0 ? (
        <EmptyState icon="cart-outline" title="הסל ריק" message="המוצרים שנשתמש בהם בשטיפה מחכים לכם בחנות" action="לחנות" onAction={() => router.replace('/store')} />
      ) : (
        <>
          {unavailable > 0 && (
            <Text color={colors.warning}>{unavailable} מוצרים שבסל כבר אינם זמינים והוסרו מהחישוב.</Text>
          )}
          <Card padded={false}>
            {lines.map((l, i) => (
              <View key={l.productId}>
                {i > 0 && <Divider />}
                <Row style={{ padding: space.md, alignItems: 'flex-start' }}>
                  <ProductImage product={l.product!} size={64} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {l.product!.nameHe}
                    </Text>
                    <Text variant="small" color={colors.textSoft}>
                      {formatPrice2(l.product!.price)} ליחידה
                    </Text>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Stepper value={l.quantity} min={1} max={l.product!.stock} onChange={(q) => cart.setQuantity(l.productId, q)} />
                      <Text variant="h3">{formatPrice2(l.product!.price * l.quantity)}</Text>
                    </Row>
                    {l.quantity > l.product!.stock && (
                      <Text variant="small" color={colors.danger}>
                        נותרו רק {l.product!.stock} יחידות
                      </Text>
                    )}
                  </View>
                  <IconButton icon="trash-can-outline" label="הסרה מהסל" size={34} color={colors.danger} background={colors.dangerSoft} onPress={() => cart.remove(l.productId)} />
                </Row>
              </View>
            ))}
          </Card>
          {freeFrom > 0 && (
            <Card style={{ gap: 4 }}>
              <InfoLine icon="truck-fast-outline" label="משלוח" value={missing > 0 ? `עוד ${formatPrice(missing)} למשלוח חינם` : 'חינם!'} />
              <InfoLine icon="store-outline" label="איסוף עצמי מהעסק" value="חינם" />
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
