import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { TextInput, View, StyleSheet, Platform } from 'react-native';
import { api, type PriceEntry } from '../../api';
import { Button } from '../../components/Button';
import { serviceIcon, vehicleIcon } from '../../components/Domain';
import { Card, ErrorState, Hero, Loader, Row, Screen } from '../../components/Layout';
import { Text } from '../../components/Text';
import { formatPrice } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useConfig } from '../../state/config';
import { useFeedback } from '../../state/feedback';
import { colors, fonts, radius, space } from '../../theme';

const key = (v: string, s: string) => `${v}|${s}`;

export default function PricesAdmin() {
  const { toast } = useFeedback();
  const { reload: reloadConfig } = useConfig();
  const catalog = useAsync(() => api.getCatalog(), []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (catalog.data) setDraft(Object.fromEntries(catalog.data.prices.map((p) => [key(p.vehicleTypeCode, p.serviceCode), String(p.price)])));
  }, [catalog.data]);

  const changes = useMemo<PriceEntry[]>(() => {
    if (!catalog.data) return [];
    const out: PriceEntry[] = [];
    for (const v of catalog.data.vehicleTypes)
      for (const s of catalog.data.services) {
        const k = key(v.code, s.code);
        const original = catalog.data.prices.find((p) => p.vehicleTypeCode === v.code && p.serviceCode === s.code)?.price;
        const next = Number(draft[k]);
        if (draft[k] !== undefined && draft[k] !== '' && Number.isFinite(next) && next !== original) out.push({ vehicleTypeCode: v.code, serviceCode: s.code, price: next });
      }
    return out;
  }, [draft, catalog.data]);

  async function save() {
    setSaving(true);
    try {
      catalog.setData(await api.updatePrices(changes));
      reloadConfig();
      toast(`עודכנו ${changes.length} מחירים`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      header={<Hero back eyebrow="ניהול" title="מחירון" subtitle="המחירים מתעדכנים מיד באפליקציה. תורים שכבר נקבעו נשארים במחיר המקורי." compact />}
      footer={<Button title={changes.length ? `שמירת ${changes.length} שינויים` : 'אין שינויים'} icon="content-save-outline" onPress={save} disabled={!changes.length} loading={saving} />}
    >
      {catalog.loading ? (
        <Loader />
      ) : catalog.error ? (
        <ErrorState message={catalog.error} onRetry={catalog.reload} />
      ) : (
        catalog.data?.services.map((s) => (
          <Card key={s.code} style={{ gap: 14 }}>
            <Row>
              <MaterialCommunityIcons name={serviceIcon(s.code)} size={24} color={colors.cobalt} />
              <Text variant="h3" style={{ flex: 1 }}>
                {s.nameHe}
              </Text>
              {!s.isActive && (
                <Text variant="caption" color={colors.textMuted}>
                  מוסתר
                </Text>
              )}
            </Row>
            <Row gap={10}>
              {catalog.data!.vehicleTypes.map((v) => {
                const k = key(v.code, s.code);
                const original = catalog.data!.prices.find((p) => p.vehicleTypeCode === v.code && p.serviceCode === s.code)?.price;
                const changed = draft[k] !== undefined && Number(draft[k]) !== original;
                return (
                  <View key={v.code} style={[styles.priceBox, changed && styles.changed]}>
                    <Row gap={6}>
                      <MaterialCommunityIcons name={vehicleIcon(v.code)} size={18} color={colors.textSoft} />
                      <Text variant="small" color={colors.textSoft}>
                        {v.nameHe}
                      </Text>
                    </Row>
                    <Row gap={4}>
                      <Text variant="h2" color={colors.textMuted}>
                        ₪
                      </Text>
                      <TextInput
                        value={draft[k] ?? ''}
                        onChangeText={(t) => setDraft((d) => ({ ...d, [k]: t.replace(/[^\d.]/g, '') }))}
                        keyboardType="numeric"
                        style={styles.input}
                        selectTextOnFocus
                      />
                    </Row>
                    {changed && original !== undefined && (
                      <Text variant="caption" color={colors.warning}>
                        היה {formatPrice(original)}
                      </Text>
                    )}
                  </View>
                );
              })}
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  priceBox: { flex: 1, backgroundColor: colors.mist, borderRadius: radius.md, padding: space.sm, gap: 4, borderWidth: 1.5, borderColor: 'transparent' },
  changed: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
  input: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 26,
    color: colors.text,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', width: 80 } as object) : {}),
  },
});
