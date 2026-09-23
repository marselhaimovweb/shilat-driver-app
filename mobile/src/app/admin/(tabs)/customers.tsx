import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { api, type CustomerSummary } from '../../../api';
import { Field } from '../../../components/Controls';
import { Tag } from '../../../components/Domain';
import { Card, EmptyState, ErrorState, Hero, Loader, Row, Screen } from '../../../components/Layout';
import { Text } from '../../../components/Text';
import { formatDateShort } from '../../../lib/dates';
import { formatPhone, formatPrice } from '../../../lib/format';
import { colors, radius } from '../../../theme';

export default function Customers() {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<CustomerSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listCustomers(search.trim() || undefined);
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen header={<Hero title="לקוחות" subtitle={items ? `${total} לקוחות רשומים` : undefined} compact />}>
      <Field icon="magnify" placeholder="חיפוש לפי שם, טלפון או מספר רכב" value={search} onChangeText={setSearch} />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !items ? (
        <Loader />
      ) : items.length === 0 ? (
        <EmptyState icon="account-search-outline" title="לא נמצאו לקוחות" />
      ) : (
        items.map((c) => (
          <Card key={c.id} onPress={() => router.push({ pathname: '/admin/customer/[id]', params: { id: String(c.id) } })} style={{ gap: 10, padding: 14 }}>
            <Row>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.foam, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="h3" color={colors.ocean}>
                  {(c.fullName ?? '?')[0]}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Row gap={6}>
                  <Text variant="bodyStrong">{c.fullName || 'ללא שם'}</Text>
                  {c.isBlocked && <Tag label="חסום" color={colors.danger} background={colors.dangerSoft} icon="block-helper" />}
                  {c.visits >= 10 && <Tag label="VIP" color="#B7791F" background="#FFF6DD" icon="crown-outline" />}
                </Row>
                <Text variant="small" color={colors.textSoft}>
                  {formatPhone(c.phone)}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-left" size={22} color={colors.textMuted} />
            </Row>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Metric label="ביקורים" value={String(c.visits)} />
              <Metric label="סה״כ" value={formatPrice(c.totalSpent)} />
              <Metric label="ביקור אחרון" value={c.lastVisit ? formatDateShort(c.lastVisit) : '—'} />
              {c.noShows > 0 && <Metric label="לא הגיע" value={String(c.noShows)} warn />}
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ backgroundColor: warn ? colors.dangerSoft : colors.mist, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', gap: 6 }}>
      <Text variant="small" color={warn ? colors.danger : colors.textSoft}>
        {label}
      </Text>
      <Text variant="small" color={warn ? colors.danger : colors.text} style={{ fontFamily: 'Rubik_600SemiBold' }}>
        {value}
      </Text>
    </View>
  );
}
