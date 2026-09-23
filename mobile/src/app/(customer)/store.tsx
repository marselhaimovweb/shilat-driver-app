import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../../api';
import { Button, haptic } from '../../components/Button';
import { Chip, ChipRow } from '../../components/Controls';
import { EmptyState, ErrorState, Hero, Loader, Row, Screen } from '../../components/Layout';
import { LegalLinks } from '../../components/Legal';
import { PriceTag, ProductImage } from '../../components/Store';
import { Text } from '../../components/Text';
import { formatPrice } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useCart } from '../../state/cart';
import { useConfig } from '../../state/config';
import { useFeedback } from '../../state/feedback';
import { colors, radius, shadows, space } from '../../theme';

export default function Store() {
  const store = useAsync(() => api.getStore(), []);
  const cart = useCart();
  const { config } = useConfig();
  const { toast } = useFeedback();
  const [category, setCategory] = useState<number | 'all'>('all');

  useFocusEffect(
    useCallback(() => {
      store.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const products = useMemo(
    () => (store.data?.products ?? []).filter((p) => category === 'all' || p.categoryId === category),
    [store.data, category],
  );

  const cartButton = (
    <Pressable onPress={() => router.push('/cart')} style={styles.cartBtn} accessibilityRole="button" accessibilityLabel={`סל הקניות, ${cart.count} פריטים`}>
      <MaterialCommunityIcons name="cart-outline" size={24} color="#fff" />
      {cart.count > 0 && (
        <View style={styles.cartCount}>
          <Text variant="caption" color={colors.navy}>
            {cart.count}
          </Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <Screen
      refreshing={store.refreshing}
      onRefresh={store.refresh}
      header={
        <Hero eyebrow="חנות הציוד" title="הברק נמשך גם בבית" subtitle="המוצרים שאנחנו עובדים איתם - עכשיו גם אצלכם" compact right={cartButton} back={false}>
          {!!config?.rules.storeFreeDeliveryFrom && (
            <Row gap={8} style={styles.shipping}>
              <MaterialCommunityIcons name="truck-fast-outline" size={18} color={colors.aqua} />
              <Text variant="small" color={colors.onDarkSoft}>
                משלוח חינם מעל {formatPrice(config.rules.storeFreeDeliveryFrom)} · איסוף עצמי תמיד חינם
              </Text>
            </Row>
          )}
        </Hero>
      }
    >
      {store.loading ? (
        <Loader />
      ) : store.error ? (
        <ErrorState message={store.error} onRetry={store.reload} />
      ) : !store.data?.enabled ? (
        <EmptyState icon="store-off-outline" title="החנות סגורה כרגע" message="נחזור בקרוב עם מוצרים חדשים" />
      ) : (
        <>
          <View style={{ marginHorizontal: -space.lg }}>
            <ChipRow>
              <Chip label="הכל" selected={category === 'all'} onPress={() => setCategory('all')} />
              {store.data.categories.map((c) => (
                <Chip key={c.id} label={c.nameHe} selected={category === c.id} onPress={() => setCategory(c.id)} />
              ))}
            </ChipRow>
          </View>
          <View style={styles.grid}>
            {products.map((p) => {
              const out = p.stock <= 0;
              return (
                <Pressable
                  key={p.id}
                  style={[styles.card, shadows.sm]}
                  onPress={() => router.push({ pathname: '/product/[id]', params: { id: String(p.id) } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.nameHe}, ${p.price} שקלים${out ? ', אזל מהמלאי' : ''}`}
                >
                  <View>
                    <ProductImage product={p} />
                    {!!p.compareAtPrice && p.compareAtPrice > p.price && (
                      <View style={styles.sale}>
                        <Text variant="caption" color="#fff">
                          מבצע
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text variant="bodyStrong" numberOfLines={2} style={{ minHeight: 44 }}>
                    {p.nameHe}
                  </Text>
                  <PriceTag price={p.price} compareAt={p.compareAtPrice} />
                  {out ? (
                    <Text variant="small" color={colors.danger}>
                      אזל מהמלאי
                    </Text>
                  ) : (
                    <Button
                      title="הוספה לסל"
                      icon="cart-plus"
                      size="sm"
                      variant="secondary"
                      onPress={() => {
                        const inCart = cart.lines.find((l) => l.productId === p.id)?.quantity ?? 0;
                        if (inCart >= p.stock) return toast('אין מספיק מלאי', 'error');
                        haptic('success');
                        cart.add(p.id);
                        toast(`${p.nameHe} נוסף לסל`);
                      }}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
          {cart.count > 0 && <Button title={`לסל הקניות (${cart.count})`} icon="cart-arrow-right" onPress={() => router.push('/cart')} />}
          <Text variant="small" color={colors.textMuted} align="center">
            כל המחירים כוללים מע״מ. ביטול עסקה והחזרות לפי חוק הגנת הצרכן.
          </Text>
          <LegalLinks />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { width: '48%', flexGrow: 1, maxWidth: 260, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 10, gap: 8 },
  sale: { position: 'absolute', top: 8, right: 8, backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  cartBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' },
  cartCount: { position: 'absolute', top: -2, left: -2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.aqua, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  shipping: { backgroundColor: colors.glass, borderRadius: radius.md, padding: 10, borderWidth: 1, borderColor: colors.glassLine },
});
