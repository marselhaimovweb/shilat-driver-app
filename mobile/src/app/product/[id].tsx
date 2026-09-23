import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../api';
import { Button } from '../../components/Button';
import { Stepper } from '../../components/Controls';
import { Card, ErrorState, Hero, Loader, Row, Screen } from '../../components/Layout';
import { LegalLink } from '../../components/Legal';
import { PriceTag, ProductImage } from '../../components/Store';
import { Text } from '../../components/Text';
import { useAsync } from '../../lib/useAsync';
import { useCart } from '../../state/cart';
import { useFeedback } from '../../state/feedback';
import { colors, radius } from '../../theme';

export default function ProductPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useAsync(() => api.getStore(), []);
  const cart = useCart();
  const { toast } = useFeedback();
  const [qty, setQty] = useState(1);
  const p = store.data?.products.find((x) => x.id === Number(id));
  const inCart = cart.lines.find((l) => l.productId === Number(id))?.quantity ?? 0;

  return (
    <Screen
      header={<Hero back eyebrow={p?.categoryName ?? 'חנות'} title={p?.nameHe ?? ''} compact />}
      footer={
        p && p.stock > 0 ? (
          <Row>
            <Stepper value={qty} onChange={setQty} min={1} max={Math.max(1, p.stock - inCart)} />
            <Button
              title="הוספה לסל"
              icon="cart-plus"
              style={{ flex: 1 }}
              disabled={inCart >= p.stock}
              onPress={() => {
                cart.add(p.id, qty);
                toast('נוסף לסל');
                router.back();
              }}
            />
          </Row>
        ) : undefined
      }
    >
      {store.loading ? (
        <Loader />
      ) : !p ? (
        <ErrorState message="המוצר אינו זמין" />
      ) : (
        <>
          <ProductImage product={p} style={{ maxWidth: 420, alignSelf: 'center', borderRadius: radius.xl }} />
          <Row style={{ justifyContent: 'space-between' }}>
            <PriceTag price={p.price} compareAt={p.compareAtPrice} big />
            <Text variant="small" color={p.stock > 0 ? (p.stock <= p.lowStockThreshold ? colors.warning : colors.success) : colors.danger}>
              {p.stock <= 0 ? 'אזל מהמלאי' : p.stock <= p.lowStockThreshold ? `נותרו ${p.stock} יחידות` : 'במלאי'}
            </Text>
          </Row>
          <Text variant="caption" color={colors.textMuted}>
            המחיר כולל מע״מ{p.sku ? ` · מק״ט ${p.sku}` : ''}
          </Text>
          {!!p.descriptionHe && (
            <Card>
              <Text>{p.descriptionHe}</Text>
            </Card>
          )}
          {!!p.usageWarnings && (
            <Row style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 14, alignItems: 'flex-start' }}>
              <MaterialCommunityIcons name="alert-outline" size={22} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">אזהרות ובטיחות</Text>
                <Text variant="small" color={colors.textSoft}>
                  {p.usageWarnings} יש לקרוא את התווית שעל האריזה לפני השימוש.
                </Text>
              </View>
            </Row>
          )}
          <Row style={{ alignItems: 'flex-start' }}>
            <MaterialCommunityIcons name="keyboard-return" size={20} color={colors.textSoft} />
            <Text variant="small" color={colors.textSoft} style={{ flex: 1 }}>
              {p.isReturnable
                ? 'ניתן לבטל ולהחזיר תוך 14 יום מקבלת המוצר, באריזה סגורה ובלי שימוש.'
                : 'מוצר זה אינו ניתן להחזרה לאחר פתיחת האריזה, למעט במקרה של פגם.'}{' '}
              <LegalLink docKey="CANCELLATION">למדיניות המלאה</LegalLink>
            </Text>
          </Row>
        </>
      )}
    </Screen>
  );
}
