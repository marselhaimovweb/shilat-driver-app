import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { api } from '../../../api';
import { QuickActions } from '../../../components/AdminActions';
import { Button } from '../../../components/Button';
import { Field, Stars } from '../../../components/Controls';
import { Plate, StatusBadge, Tag } from '../../../components/Domain';
import { Card, Divider, ErrorState, Hero, InfoLine, Loader, Row, Screen, SectionTitle } from '../../../components/Layout';
import { Text } from '../../../components/Text';
import { formatDateLong } from '../../../lib/dates';
import { BOOKING_TYPE_LABEL, DEPOSIT_LABEL, formatPhone, formatPrice, PAYMENT_LABEL, STATUS_LABEL } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { useFeedback } from '../../../state/feedback';
import { colors, space } from '../../../theme';

const SOURCE_LABEL = { APP: 'אפליקציה', ADMIN: 'מנהל', WALKIN: 'לקוח בעמדה', PHONE: 'טלפון' } as const;

export default function AppointmentDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useFeedback();
  const data = useAsync(() => api.getAppointmentDetails(Number(id)), [id]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (data.data) setNotes(data.data.adminNotes ?? '');
  }, [data.data]);

  const a = data.data;
  return (
    <Screen
      header={
        <Hero back eyebrow={a ? `תור #${a.id} · ${BOOKING_TYPE_LABEL[a.bookingType]}` : ''} title={a ? `${a.time} · ${a.serviceName}` : 'פרטי תור'} subtitle={a ? formatDateLong(a.date) : undefined} compact>
          {a && (
            <Row gap={8}>
              <StatusBadge status={a.status} />
              <Tag label={`מקור: ${SOURCE_LABEL[a.source]}`} color={colors.onDarkSoft} background={colors.glass} />
            </Row>
          )}
        </Hero>
      }
    >
      {data.loading ? (
        <Loader />
      ) : data.error || !a ? (
        <ErrorState message={data.error ?? 'לא נמצא'} onRetry={data.reload} />
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <QuickActions appointment={a} onChanged={data.reload} />
            {!['CONFIRMED', 'IN_PROGRESS', 'NO_SHOW', 'PENDING_PAYMENT'].includes(a.status) && (
              <Text color={colors.textSoft}>התור {STATUS_LABEL[a.status]}{a.cancelReason ? ` · ${a.cancelReason}` : ''}</Text>
            )}
          </Card>

          <SectionTitle title="לקוח ורכב" />
          <Card style={{ gap: 6 }}>
            <InfoLine icon="account-outline" label="שם" value={a.customerName || '—'} />
            <InfoLine icon="phone-outline" label="טלפון" value={formatPhone(a.customerPhone)} />
            <InfoLine icon="car-outline" label="רכב" value={a.plateNumber ? <Plate number={a.plateNumber} /> : a.vehicleTypeName} />
            <InfoLine icon="car-info" label="סוג" value={a.vehicleTypeName} />
            {!!a.addonNames && <InfoLine icon="star-plus-outline" label="תוספות" value={a.addonNames} />}
            {a.needsAccessibility && (
              <Row style={{ backgroundColor: colors.infoSoft, borderRadius: 12, padding: 10 }}>
                <MaterialCommunityIcons name="wheelchair-accessibility" size={20} color={colors.cobalt} />
                <Text variant="bodyStrong" color={colors.cobalt}>
                  הלקוח ביקש סיוע נגישות - היערכו מראש
                </Text>
              </Row>
            )}
            {a.customerNotes && <InfoLine icon="message-text-outline" label="הערת לקוח" value={a.customerNotes} />}
            <Row gap={10} style={{ marginTop: 8 }}>
              <Button title="התקשרות" icon="phone" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${a.customerPhone}`)} />
              <Button
                title="WhatsApp"
                icon="whatsapp"
                variant="secondary"
                size="md"
                style={{ flex: 1 }}
                onPress={() => Linking.openURL(`https://wa.me/972${a.customerPhone.replace(/\D/g, '').slice(1)}`)}
              />
            </Row>
            <Button
              title="כרטיס לקוח"
              variant="ghost"
              size="md"
              icon="account-details-outline"
              onPress={() => router.push({ pathname: '/admin/customer/[id]', params: { id: String(a.customerId) } })}
            />
          </Card>

          <SectionTitle title="תשלום" />
          <Card style={{ gap: 6 }}>
            <InfoLine label="מחיר" value={formatPrice(a.price)} />
            {a.discountAmount > 0 && <InfoLine label={a.isFreeLoyalty ? 'הנחת מועדון' : 'הנחה'} value={`-${formatPrice(a.discountAmount)}`} />}
            <InfoLine label="מקדמה" value={a.depositAmount ? `${formatPrice(a.depositAmount)} · ${DEPOSIT_LABEL[a.depositStatus]}` : 'ללא'} />
            <InfoLine label="שולם בפועל" value={formatPrice(a.amountPaid)} strong />
            {a.paymentMethod && <InfoLine label="אמצעי תשלום" value={PAYMENT_LABEL[a.paymentMethod]} />}
          </Card>

          {a.rating && (
            <Card style={{ gap: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="h3">דירוג הלקוח</Text>
                <Stars value={a.rating} size={18} />
              </Row>
              {a.reviewComment && <Text color={colors.textSoft}>“{a.reviewComment}”</Text>}
            </Card>
          )}

          <SectionTitle title="הערות פנימיות" />
          <Card style={{ gap: 10 }}>
            <Field placeholder="הערות לצוות (לא מוצג ללקוח)" value={notes} onChangeText={setNotes} multiline maxLength={300} />
            <Button
              title="שמירת הערה"
              variant="secondary"
              size="md"
              onPress={async () => {
                await api.setAppointmentNotes(a.id, notes);
                toast('ההערה נשמרה');
              }}
            />
          </Card>

          {a.log.length > 0 && (
            <>
              <SectionTitle title="היסטוריית סטטוסים" />
              <Card padded={false}>
                {a.log.map((l, i) => (
                  <View key={i}>
                    {i > 0 && <Divider />}
                    <Row style={{ padding: space.md }}>
                      <MaterialCommunityIcons name="circle-medium" size={20} color={colors.cobalt} />
                      <Text style={{ flex: 1 }}>{STATUS_LABEL[l.newStatus as keyof typeof STATUS_LABEL] ?? l.newStatus}</Text>
                      <Text variant="small" color={colors.textMuted}>
                        {l.changedBy} · {new Date(l.changedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                      </Text>
                    </Row>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
