import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api, type Product, type ProductInput } from '../../../../api';
import { Button } from '../../../../components/Button';
import { Chip, Field, Segmented, Stepper, Toggle } from '../../../../components/Controls';
import { Card, Divider, ErrorState, Hero, Loader, Row, Screen, SectionTitle } from '../../../../components/Layout';
import { ProductImage } from '../../../../components/Store';
import { Text } from '../../../../components/Text';
import { useAsync } from '../../../../lib/useAsync';
import { Sheet, useFeedback } from '../../../../state/feedback';
import { colors, space } from '../../../../theme';

const EMPTY: ProductInput = {
  categoryId: null,
  sku: '',
  nameHe: '',
  descriptionHe: '',
  usageWarnings: '',
  price: 0,
  compareAtPrice: null,
  lowStockThreshold: 3,
  imageUrl: '',
  isReturnable: true,
  isActive: true,
  stock: 0,
};

const REASON_LABEL = { SALE: 'מכירה', RESTOCK: 'קבלת סחורה', ADJUST: 'תיקון מלאי', RETURN: 'החזרה', CANCEL: 'ביטול הזמנה' } as const;

export default function ProductEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { toast, confirm } = useFeedback();
  const store = useAsync(() => api.adminGetStore(), []);
  const movements = useAsync(() => (isNew ? Promise.resolve([]) : api.listStockMovements(Number(id))), [id]);
  const product: Product | undefined = store.data?.products.find((p) => p.id === Number(id));
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [price, setPrice] = useState('');
  const [compare, setCompare] = useState('');
  const [saving, setSaving] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  useEffect(() => {
    if (product) {
      const { id: _id, categoryName: _c, hasImage: _h, ...rest } = product;
      setForm({ ...rest, sku: rest.sku ?? '', descriptionHe: rest.descriptionHe ?? '', usageWarnings: rest.usageWarnings ?? '', imageUrl: rest.imageUrl ?? '' });
      setPrice(String(product.price));
      setCompare(product.compareAtPrice ? String(product.compareAtPrice) : '');
    }
  }, [product]);

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    const data: ProductInput = { ...form, price: Number(price) || 0, compareAtPrice: compare ? Number(compare) : null };
    if (data.nameHe.trim().length < 2) return toast('יש להזין שם מוצר', 'error');
    if (data.price <= 0) return toast('יש להזין מחיר', 'error');
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.createProduct(data);
        toast('המוצר נוצר');
        router.replace({ pathname: '/admin/store/product/[id]', params: { id: String(res.id) } });
      } else {
        await api.updateProduct(Number(id), data);
        toast('המוצר נשמר');
        store.reload();
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    if (res.canceled || !res.assets[0]?.base64) return;
    const asset = res.assets[0];
    const type = asset.mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
    try {
      await api.uploadProductImage(Number(id), asset.base64!, type);
      toast('התמונה עודכנה');
      store.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (store.loading) return <Screen header={<Hero back title="מוצר" compact />}><Loader /></Screen>;
  if (!isNew && !product) return <Screen header={<Hero back title="מוצר" compact />}><ErrorState message="המוצר לא נמצא" /></Screen>;

  return (
    <Screen
      header={<Hero back eyebrow="חנות" title={isNew ? 'מוצר חדש' : form.nameHe} compact />}
      footer={<Button title={isNew ? 'יצירת המוצר' : 'שמירת שינויים'} icon="content-save-outline" onPress={save} loading={saving} />}
    >
      {!isNew && product && (
        <Card style={{ gap: 12 }}>
          <Row>
            <ProductImage product={product} size={96} />
            <View style={{ flex: 1, gap: 8 }}>
              <Button title={product.hasImage ? 'החלפת תמונה' : 'העלאת תמונה'} icon="image-plus" size="sm" variant="secondary" onPress={pickImage} />
              {product.hasImage && (
                <Button
                  title="הסרת תמונה"
                  size="sm"
                  variant="ghost"
                  onPress={async () => {
                    await api.deleteProductImage(product.id);
                    store.reload();
                  }}
                />
              )}
            </View>
          </Row>
        </Card>
      )}

      <Card style={{ gap: 14 }}>
        <Field label="שם המוצר" value={form.nameHe} onChangeText={(t) => set('nameHe', t)} maxLength={100} />
        <Row gap={10}>
          <Field style={{ flex: 1 }} label="מחיר (₪, כולל מע״מ)" keyboardType="decimal-pad" value={price} onChangeText={(t) => setPrice(t.replace(/[^\d.]/g, ''))} />
          <Field style={{ flex: 1 }} label="מחיר לפני מבצע" keyboardType="decimal-pad" value={compare} onChangeText={(t) => setCompare(t.replace(/[^\d.]/g, ''))} placeholder="לא חובה" />
        </Row>
        <Field label="מק״ט" value={form.sku ?? ''} onChangeText={(t) => set('sku', t)} maxLength={40} />
        <Field label="תיאור" value={form.descriptionHe ?? ''} onChangeText={(t) => set('descriptionHe', t)} multiline maxLength={1000} />
        <Field
          label="אזהרות ובטיחות (לחומרים כימיים - חובה)"
          value={form.usageWarnings ?? ''}
          onChangeText={(t) => set('usageWarnings', t)}
          multiline
          maxLength={500}
          hint="למשל: להרחיק מהישג ידם של ילדים"
        />
        <Field label="קישור לתמונה (אם לא מעלים)" value={form.imageUrl ?? ''} onChangeText={(t) => set('imageUrl', t)} autoCapitalize="none" keyboardType="url" placeholder="https://" />
      </Card>

      <SectionTitle title="קטגוריה" />
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {store.data?.categories.map((c) => (
          <Chip key={c.id} label={c.nameHe} selected={form.categoryId === c.id} onPress={() => set('categoryId', c.id)} />
        ))}
      </Row>

      <Card padded={false}>
        <Row style={{ padding: space.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">מוצג בחנות</Text>
            <Text variant="small" color={colors.textSoft}>
              כבוי = מוסתר מהלקוחות
            </Text>
          </View>
          <Toggle label="מוצג בחנות" value={form.isActive} onChange={(v) => set('isActive', v)} />
        </Row>
        <Divider />
        <Row style={{ padding: space.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">ניתן להחזרה</Text>
            <Text variant="small" color={colors.textSoft}>
              כבוי = לא ניתן להחזיר לאחר פתיחה (למשל ריחות). מוצג ללקוח לפני הקנייה
            </Text>
          </View>
          <Toggle label="ניתן להחזרה" value={form.isReturnable} onChange={(v) => set('isReturnable', v)} />
        </Row>
        <Divider />
        <Row style={{ padding: space.md }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">התראת מלאי נמוך</Text>
            <Text variant="small" color={colors.textSoft}>
              מתחת לכמות זו תופיע התראה
            </Text>
          </View>
          <Stepper value={form.lowStockThreshold} onChange={(v) => set('lowStockThreshold', v)} min={0} max={1000} />
        </Row>
        {isNew && (
          <>
            <Divider />
            <Row style={{ padding: space.md }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                מלאי פתיחה
              </Text>
              <Stepper value={form.stock ?? 0} onChange={(v) => set('stock', v)} min={0} max={100000} />
            </Row>
          </>
        )}
      </Card>

      {!isNew && product && (
        <>
          <SectionTitle title={`מלאי: ${product.stock} יחידות`} action="עדכון מלאי" onAction={() => setStockOpen(true)} />
          <Card padded={false}>
            {(movements.data ?? []).slice(0, 15).map((m, i) => (
              <View key={m.id}>
                {i > 0 && <Divider />}
                <Row style={{ padding: 12 }}>
                  <Text variant="bodyStrong" color={m.delta > 0 ? colors.success : colors.danger} style={{ width: 48 }}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text>
                      {REASON_LABEL[m.reason]}
                      {m.orderId ? ` · הזמנה #${m.orderId}` : ''}
                    </Text>
                    {!!m.note && (
                      <Text variant="small" color={colors.textSoft}>
                        {m.note}
                      </Text>
                    )}
                  </View>
                  <Text variant="caption" color={colors.textMuted}>
                    {new Date(m.createdAt).toLocaleDateString('he-IL')}
                  </Text>
                </Row>
              </View>
            ))}
            {!movements.data?.length && (
              <Text color={colors.textMuted} style={{ padding: space.md }}>
                אין תנועות מלאי
              </Text>
            )}
          </Card>
          <StockSheet
            visible={stockOpen}
            onClose={() => setStockOpen(false)}
            onSave={async (delta, reason, note) => {
              try {
                await api.adjustStock(product.id, delta, reason, note);
                setStockOpen(false);
                toast('המלאי עודכן');
                store.reload();
                movements.reload();
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          />
          <Button
            title={product.isActive ? 'הסתרת המוצר מהחנות' : 'הצגת המוצר בחנות'}
            variant="ghost"
            icon={product.isActive ? 'eye-off-outline' : 'eye-outline'}
            onPress={async () => {
              if (product.isActive && !(await confirm({ title: 'להסתיר את המוצר?', message: 'המוצר לא יוצג ללקוחות. הזמנות קיימות לא יושפעו.', confirmText: 'הסתרה' }))) return;
              const { id: _i, categoryName: _c, hasImage: _h, ...rest } = product;
              await api.updateProduct(product.id, { ...rest, isActive: !product.isActive });
              store.reload();
            }}
          />
        </>
      )}
    </Screen>
  );
}

function StockSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (delta: number, reason: 'RESTOCK' | 'ADJUST', note?: string) => void }) {
  const [mode, setMode] = useState<'RESTOCK' | 'ADJUST_UP' | 'ADJUST_DOWN'>('RESTOCK');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  return (
    <Sheet visible={visible} onClose={onClose} title="עדכון מלאי">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'RESTOCK', label: 'קבלת סחורה' },
          { value: 'ADJUST_UP', label: 'תיקון +' },
          { value: 'ADJUST_DOWN', label: 'תיקון - / פחת' },
        ]}
      />
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="bodyStrong">כמות</Text>
        <Stepper value={qty} onChange={setQty} min={1} max={100000} />
      </Row>
      <Field label="הערה (לא חובה)" value={note} onChangeText={setNote} placeholder="למשל: משלוח מספק, מוצר פגום" />
      <Button
        title="עדכון"
        onPress={() => {
          onSave(mode === 'ADJUST_DOWN' ? -qty : qty, mode === 'RESTOCK' ? 'RESTOCK' : 'ADJUST', note.trim() || undefined);
          setQty(1);
          setNote('');
        }}
      />
    </Sheet>
  );
}
