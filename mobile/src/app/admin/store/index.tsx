import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { api, type OrderStatus, type ProductCategory } from '../../../api';
import { Button } from '../../../components/Button';
import { Chip, ChipRow, Field, Segmented, Toggle } from '../../../components/Controls';
import { Card, Divider, EmptyState, ErrorState, Hero, Loader, Row, Screen } from '../../../components/Layout';
import { formatPrice2, OrderBadge, ProductImage } from '../../../components/Store';
import { Text } from '../../../components/Text';
import { useAsync } from '../../../lib/useAsync';
import { Sheet, useFeedback } from '../../../state/feedback';
import { colors, radius, space } from '../../../theme';

type Tab = 'products' | 'orders' | 'categories';

const ORDER_VIEWS: { value: string; label: string; statuses?: OrderStatus[] }[] = [
  { value: 'todo', label: 'לטיפול', statuses: ['PAID', 'PREPARING', 'READY', 'RETURN_REQUESTED'] },
  { value: 'shipped', label: 'נשלחו', statuses: ['SHIPPED'] },
  { value: 'done', label: 'הושלמו', statuses: ['COMPLETED'] },
  { value: 'closed', label: 'בוטלו / זוכו', statuses: ['CANCELLED', 'REFUNDED'] },
  { value: 'all', label: 'הכל' },
];

export default function StoreAdmin() {
  const [tab, setTab] = useState<Tab>('products');
  return (
    <Screen
      header={
        <Hero back eyebrow="ניהול" title="חנות ומלאי" compact>
          <Segmented
            tone="dark"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'products', label: 'מוצרים', icon: 'package-variant' },
              { value: 'orders', label: 'הזמנות', icon: 'receipt' },
              { value: 'categories', label: 'קטגוריות', icon: 'shape-outline' },
            ]}
          />
        </Hero>
      }
    >
      {tab === 'products' ? <Products /> : tab === 'orders' ? <Orders /> : <Categories />}
    </Screen>
  );
}

function Products() {
  const store = useAsync(() => api.adminGetStore(), []);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  useFocusEffect(
    useCallback(() => {
      store.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const list = useMemo(
    () =>
      (store.data?.products ?? [])
        .filter((p) => !search || p.nameHe.includes(search) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase()))
        .filter((p) => !lowOnly || p.stock <= p.lowStockThreshold),
    [store.data, search, lowOnly],
  );
  const lowCount = (store.data?.products ?? []).filter((p) => p.isActive && p.stock <= p.lowStockThreshold).length;

  if (store.loading) return <Loader />;
  if (store.error) return <ErrorState message={store.error} onRetry={store.reload} />;
  return (
    <>
      <Button title="מוצר חדש" icon="plus" onPress={() => router.push({ pathname: '/admin/store/product/[id]', params: { id: 'new' } })} />
      <Field icon="magnify" placeholder="חיפוש לפי שם או מק״ט" value={search} onChangeText={setSearch} />
      {lowCount > 0 && (
        <Row style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 12 }}>
          <MaterialCommunityIcons name="alert-outline" size={20} color={colors.warning} />
          <Text style={{ flex: 1 }}>{lowCount} מוצרים במלאי נמוך</Text>
          <Chip label={lowOnly ? 'הצג הכל' : 'הצג רק אותם'} selected={lowOnly} onPress={() => setLowOnly(!lowOnly)} />
        </Row>
      )}
      {list.length === 0 ? (
        <EmptyState icon="package-variant" title="אין מוצרים" />
      ) : (
        <Card padded={false}>
          {list.map((p, i) => {
            const low = p.stock <= p.lowStockThreshold;
            return (
              <View key={p.id}>
                {i > 0 && <Divider />}
                <Row style={{ padding: space.md, opacity: p.isActive ? 1 : 0.5 }}>
                  <ProductImage product={p} size={56} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {p.nameHe}
                    </Text>
                    <Text variant="small" color={colors.textSoft}>
                      {formatPrice2(p.price)} · {p.categoryName ?? 'ללא קטגוריה'}
                      {!p.isActive ? ' · מוסתר' : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center', minWidth: 58, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: p.stock <= 0 ? colors.dangerSoft : low ? colors.warningSoft : colors.successSoft }}>
                    <Text variant="h3" color={p.stock <= 0 ? colors.danger : low ? colors.warning : colors.success}>
                      {p.stock}
                    </Text>
                    <Text variant="caption" color={colors.textSoft}>
                      במלאי
                    </Text>
                  </View>
                  <Button title="עריכה" size="sm" variant="secondary" full={false} onPress={() => router.push({ pathname: '/admin/store/product/[id]', params: { id: String(p.id) } })} />
                </Row>
              </View>
            );
          })}
        </Card>
      )}
    </>
  );
}

function Orders() {
  const [view, setView] = useState('todo');
  const statuses = ORDER_VIEWS.find((v) => v.value === view)?.statuses;
  const orders = useAsync(() => api.adminListOrders(statuses), [view]);
  useFocusEffect(
    useCallback(() => {
      orders.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view]),
  );
  return (
    <>
      <View style={{ marginHorizontal: -space.lg }}>
        <ChipRow>
          {ORDER_VIEWS.map((v) => (
            <Chip key={v.value} label={v.label} selected={view === v.value} onPress={() => setView(v.value)} />
          ))}
        </ChipRow>
      </View>
      {orders.loading ? (
        <Loader />
      ) : orders.error ? (
        <ErrorState message={orders.error} onRetry={orders.reload} />
      ) : !orders.data?.length ? (
        <EmptyState icon="receipt" title="אין הזמנות בתצוגה זו" />
      ) : (
        orders.data.map((o) => (
          <Card key={o.id} onPress={() => router.push({ pathname: '/admin/store/order/[id]', params: { id: String(o.id) } })} style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="h3">#{o.id} · {o.customerName ?? 'לקוח'}</Text>
              <OrderBadge status={o.status} />
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={6}>
                <MaterialCommunityIcons name={o.fulfillment === 'DELIVERY' ? 'truck-fast-outline' : 'store-outline'} size={18} color={colors.textSoft} />
                <Text variant="small" color={colors.textSoft}>
                  {new Date(o.createdAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })} · {o.itemCount} פריטים
                  {o.fulfillment === 'DELIVERY' && o.shipCity ? ` · ${o.shipCity}` : ''}
                </Text>
              </Row>
              <Text variant="bodyStrong">{formatPrice2(o.total)}</Text>
            </Row>
          </Card>
        ))
      )}
    </>
  );
}

function Categories() {
  const store = useAsync(() => api.adminGetStore(), []);
  const { toast } = useFeedback();
  const [editing, setEditing] = useState<ProductCategory | 'new' | null>(null);
  const [name, setName] = useState('');

  async function save() {
    if (name.trim().length < 2) return toast('שם קצר מדי', 'error');
    try {
      store.setData(editing === 'new' ? await api.createCategory({ nameHe: name.trim() }) : await api.updateCategory((editing as ProductCategory).id, { nameHe: name.trim() }));
      setEditing(null);
      toast('נשמר');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (store.loading) return <Loader />;
  return (
    <>
      <Button
        title="קטגוריה חדשה"
        icon="plus"
        variant="secondary"
        onPress={() => {
          setName('');
          setEditing('new');
        }}
      />
      <Card padded={false}>
        {store.data?.categories.map((c, i) => (
          <View key={c.id}>
            {i > 0 && <Divider />}
            <Row style={{ padding: space.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{c.nameHe}</Text>
                <Text variant="small" color={colors.textSoft}>
                  {store.data!.products.filter((p) => p.categoryId === c.id).length} מוצרים
                </Text>
              </View>
              <Button
                title="שינוי שם"
                size="sm"
                variant="ghost"
                full={false}
                onPress={() => {
                  setName(c.nameHe);
                  setEditing(c);
                }}
              />
              <Toggle label={`הצגת ${c.nameHe}`} value={c.isActive} onChange={async (v) => store.setData(await api.updateCategory(c.id, { isActive: v }))} />
            </Row>
          </View>
        ))}
      </Card>
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'קטגוריה חדשה' : 'שינוי שם קטגוריה'}>
        <Field label="שם" value={name} onChangeText={setName} autoFocus />
        <Button title="שמירה" onPress={save} />
      </Sheet>
    </>
  );
}
