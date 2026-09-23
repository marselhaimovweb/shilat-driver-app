import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { api, type Availability } from '../../../api';
import { Button } from '../../../components/Button';
import { Chip, ChipRow, Field, Segmented } from '../../../components/Controls';
import { vehicleIcon } from '../../../components/Domain';
import { Card, Hero, Row, Screen, SectionTitle } from '../../../components/Layout';
import { Text } from '../../../components/Text';
import { addDays, DAY_SHORT, dayOfMonth, dayOfWeek, formatDateLong, today } from '../../../lib/dates';
import { formatPrice } from '../../../lib/format';
import { useConfig } from '../../../state/config';
import { useFeedback } from '../../../state/feedback';
import { colors, radius, space } from '../../../theme';

type Source = 'WALKIN' | 'PHONE';

/** Manual booking by the business: walk-in customers and phone orders. */
export default function AdminNewBooking() {
  const { config, priceOf } = useConfig();
  const { toast } = useFeedback();
  const [source, setSource] = useState<Source>('WALKIN');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState('PRIVATE');
  const [service, setService] = useState('EXTERIOR');
  const [date, setDate] = useState(today());
  const [time, setTime] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setTime(null);
    try {
      setAvailability(await api.adminAvailability(date, service));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [date, service, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // a walk-in is always "now", pick the first free slot automatically
    if (source === 'WALKIN' && date === today() && availability?.slots) {
      setTime(availability.slots.find((s) => s.available)?.time ?? null);
    }
  }, [availability, source, date]);

  const price = priceOf(vehicleType, service);

  async function submit() {
    if (!/^05\d{8}$/.test(phone.replace(/\D/g, ''))) return toast('מספר טלפון לא תקין', 'error');
    if (!time) return toast('בחרו שעה', 'error');
    setBusy(true);
    try {
      const res = await api.adminCreateBooking({
        phone,
        fullName: name.trim() || undefined,
        plateNumber: plate.trim() || undefined,
        vehicleTypeCode: vehicleType,
        serviceCode: service,
        date,
        time,
        source,
      });
      toast(`תור #${res.appointment.id} נקבע ל-${time}`);
      setPhone('');
      setName('');
      setPlate('');
      load();
      router.push({ pathname: '/admin/appointment/[id]', params: { id: String(res.appointment.id) } });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i));

  return (
    <Screen
      tabBarSpace
      header={
        <Hero title="תור חדש" subtitle="לקוח מזדמן בעמדה או הזמנה טלפונית" compact>
          <Segmented
            tone="dark"
            value={source}
            onChange={(s) => {
              setSource(s);
              if (s === 'WALKIN') setDate(today());
            }}
            options={[
              { value: 'WALKIN', label: 'לקוח בעמדה', icon: 'walk' },
              { value: 'PHONE', label: 'הזמנה טלפונית', icon: 'phone-outline' },
            ]}
          />
        </Hero>
      }
      footer={
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text variant="small" color={colors.textSoft}>
              {time ? `${formatDateLong(date)} · ${time}` : 'בחרו שעה'}
            </Text>
            <Text variant="h2">{price !== null ? formatPrice(price) : '—'}</Text>
          </View>
          <Button title="קביעת התור" icon="check" full={false} onPress={submit} loading={busy} disabled={!time || !phone} />
        </Row>
      }
    >
      <Card style={{ gap: 14 }}>
        <Field label="טלפון הלקוח" icon="cellphone" keyboardType="phone-pad" placeholder="050-0000000" value={phone} onChangeText={setPhone} maxLength={12} />
        <Row gap={10}>
          <Field style={{ flex: 1 }} label="שם (לא חובה)" value={name} onChangeText={setName} />
          <Field style={{ flex: 1 }} label="מספר רכב" keyboardType="number-pad" value={plate} onChangeText={setPlate} maxLength={10} />
        </Row>
      </Card>

      <SectionTitle title="רכב ושירות" />
      <Row gap={10}>
        {config?.vehicleTypes.map((v) => (
          <Pressable key={v.code} onPress={() => setVehicleType(v.code)} style={[styles.option, vehicleType === v.code && styles.optionOn]}>
            <MaterialCommunityIcons name={vehicleIcon(v.code)} size={26} color={vehicleType === v.code ? colors.cobalt : colors.textMuted} />
            <Text variant="bodyStrong">{v.nameHe}</Text>
          </Pressable>
        ))}
      </Row>
      <View style={{ marginHorizontal: -space.lg }}>
        <ChipRow>
          {config?.services.map((s) => (
            <Chip key={s.code} label={`${s.nameHe} · ${formatPrice(priceOf(vehicleType, s.code) ?? 0)}`} selected={service === s.code} onPress={() => setService(s.code)} />
          ))}
        </ChipRow>
      </View>

      {source === 'PHONE' && (
        <>
          <SectionTitle title="תאריך" />
          <View style={{ marginHorizontal: -space.lg }}>
            <ChipRow>
              {days.map((d) => (
                <Chip key={d} label={d === today() ? 'היום' : `${DAY_SHORT[dayOfWeek(d)]} ${dayOfMonth(d)}`} selected={date === d} onPress={() => setDate(d)} />
              ))}
            </ChipRow>
          </View>
        </>
      )}

      <SectionTitle title="שעה" />
      {loading ? (
        <ActivityIndicator color={colors.aqua} />
      ) : availability && !availability.isOpen ? (
        <Text color={colors.warning}>{availability.reason}</Text>
      ) : (
        <View style={styles.slots}>
          {availability?.slots.map((s) => (
            <Pressable key={s.time} disabled={!s.available} onPress={() => setTime(s.time)} style={[styles.slot, time === s.time && styles.slotOn, !s.available && { opacity: 0.3 }]}>
              <Text variant="bodyStrong" color={time === s.time ? '#fff' : colors.text}>
                {s.time}
              </Text>
              <Text variant="caption" color={time === s.time ? colors.aquaSoft : colors.textMuted}>
                {s.available ? `${s.remaining} פנויים` : 'מלא'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flex: 1, alignItems: 'center', gap: 6, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  optionOn: { borderColor: colors.cobalt, backgroundColor: '#F5F9FF' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '23%', flexGrow: 1, maxWidth: 110, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  slotOn: { backgroundColor: colors.navy, borderColor: colors.navy },
});
