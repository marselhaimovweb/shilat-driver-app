import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError, type Availability, type BookingType, type Vehicle } from '../../api';
import { Button } from '../../components/Button';
import { AddVehicleSheet } from '../../components/AddVehicleSheet';
import { Toggle } from '../../components/Controls';
import { LegalLink } from '../../components/Legal';
import { Plate, serviceIcon, vehicleIcon } from '../../components/Domain';
import { Card, EmptyState, Hero, IconBadge, Row, Screen } from '../../components/Layout';
import { Text } from '../../components/Text';
import { addDays, DAY_SHORT, dayOfMonth, dayOfWeek, formatDateLong, monthName, today } from '../../lib/dates';
import { formatPrice } from '../../lib/format';
import { useConfig } from '../../state/config';
import { useFeedback } from '../../state/feedback';
import { colors, fonts, gradients, radius, shadows, space } from '../../theme';

export default function Book() {
  const params = useLocalSearchParams<{ type?: BookingType; service?: string }>();
  const { config, reload, priceOf } = useConfig();
  const { toast } = useFeedback();
  const f = config?.features;
  const regularOn = !!f?.BOOKING_SYSTEM && !!f?.REGULAR_BOOKING;
  const futureOn = !!f?.BOOKING_SYSTEM && !!f?.FUTURE_BOOKING;

  const [type, setType] = useState<BookingType | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [serviceCode, setServiceCode] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [loyalty, setLoyalty] = useState<{ punches: number; needed: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [addonCodes, setAddonCodes] = useState<string[]>([]);
  const [needsAccessibility, setNeedsAccessibility] = useState(false);
  const addonsOn = !!f?.SERVICE_ADDONS && !!config?.addons.length;

  const loadVehicles = useCallback(async () => {
    const [list, l] = await Promise.all([api.listVehicles(), api.getLoyalty()]);
    setVehicles(list);
    setLoyalty(l.enabled ? { punches: l.punches, needed: l.punchesForFree } : null);
    setVehicleId((current) => (current && list.some((v) => v.id === current) ? current : (list[0]?.id ?? null)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
      loadVehicles().catch(() => undefined);
    }, [reload, loadVehicles]),
  );

  // deep-link params from the home screen
  useEffect(() => {
    if (params.type) setType(params.type);
    if (params.service) setServiceCode(params.service);
  }, [params.type, params.service]);

  // default booking type
  useEffect(() => {
    if (!config) return;
    setType((t) => {
      if (t === 'REGULAR' && regularOn) return t;
      if (t === 'FUTURE' && futureOn) return t;
      return regularOn ? 'REGULAR' : futureOn ? 'FUTURE' : null;
    });
  }, [config, regularOn, futureOn]);

  const futureDays = useMemo(() => {
    if (!config) return [];
    const closed = new Set(config.closedDates.map((c) => c.date));
    return Array.from({ length: config.rules.futureMaxDays }, (_, i) => {
      const d = addDays(today(), i + 1);
      const hours = config.businessHours.find((h) => h.dayOfWeek === dayOfWeek(d));
      return { date: d, open: !!hours?.isOpen && !closed.has(d) };
    });
  }, [config]);

  useEffect(() => {
    if (type === 'REGULAR') setDate(today());
    else if (type === 'FUTURE') setDate((d) => (d && d !== today() ? d : (futureDays.find((x) => x.open)?.date ?? null)));
    setTime(null);
  }, [type, futureDays]);

  const loadSlots = useCallback(async () => {
    if (!date || !serviceCode) return setAvailability(null);
    setLoadingSlots(true);
    try {
      setAvailability(await api.getAvailability(date, serviceCode, addonCodes));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoadingSlots(false);
    }
  }, [date, serviceCode, toast, addonCodes]);

  useEffect(() => {
    setTime(null);
    loadSlots();
  }, [loadSlots]);

  const vehicle = vehicles?.find((v) => v.id === vehicleId) ?? null;
  const service = config?.services.find((s) => s.code === serviceCode) ?? null;
  const selectedAddons = (config?.addons ?? []).filter((a) => addonCodes.includes(a.code));
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const basePrice = vehicle && serviceCode ? priceOf(vehicle.vehicleTypeCode, serviceCode) : null;
  const price = basePrice !== null ? basePrice + addonsTotal : null;
  const canRedeem = !!loyalty && loyalty.punches >= loyalty.needed;
  const discount = useLoyalty && canRedeem && vehicle && price ? Math.min(price, priceOf(vehicle.vehicleTypeCode, 'EXTERIOR') ?? 0) : 0;
  const total = price !== null ? price - discount : null;
  const deposit = type === 'FUTURE' && total ? Math.min(config?.rules.depositAmount ?? 0, total) : 0;
  const ready = !!(type && vehicle && service && date && time);

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    try {
      const res = await api.createBooking({
        date: date!,
        time: time!,
        serviceCode: serviceCode!,
        vehicleId: vehicle!.id,
        useLoyalty: useLoyalty && canRedeem,
        addonCodes: addonsOn ? addonCodes : undefined,
        needsAccessibility,
      });
      setTime(null);
      setUseLoyalty(false);
      setAddonCodes([]);
      setNeedsAccessibility(false);
      if (res.payment) {
        router.push({
          pathname: '/payment',
          params: {
            paymentId: String(res.payment.id),
            target: 'APPOINTMENT',
            targetId: String(res.appointment.id),
            amount: String(res.payment.amount),
            hold: String(res.holdMinutes ?? 15),
            url: res.payment.checkoutUrl ?? '',
          },
        });
      } else {
        router.push({ pathname: '/booking-success', params: { id: String(res.appointment.id) } });
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONSENT_REQUIRED') return router.push('/consent');
      toast((e as Error).message, 'error');
      loadSlots();
    } finally {
      setSubmitting(false);
    }
  }

  if (config && !f?.BOOKING_SYSTEM) {
    return (
      <Screen header={<Hero title="קביעת תור" compact />}>
        <Card>
          <EmptyState icon="calendar-remove-outline" title="מערכת התורים סגורה כרגע" message="העסק השבית זמנית את קביעת התורים באפליקציה. אפשר ליצור קשר טלפוני." />
        </Card>
      </Screen>
    );
  }

  const allSlots = availability?.slots ?? [];
  // for today, times that already passed are simply not shown
  const firstFree = allSlots.findIndex((s) => s.available);
  const slots = type === 'REGULAR' && firstFree > 0 ? allSlots.slice(firstFree) : allSlots;
  const freeSlots = slots.filter((s) => s.available);

  return (
    <Screen
      tabBarSpace
      header={<Hero eyebrow="הזמנה חדשה" title="בואו נבריק את הרכב" compact />}
      footer={
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Text variant="small" color={colors.textSoft}>
                {ready ? `${formatDateLong(date!)} · ${time}` : 'השלימו את הפרטים'}
              </Text>
              <Row gap={8}>
                <Text variant="h2">{total !== null ? formatPrice(total) : '—'}</Text>
                {discount > 0 && (
                  <Text variant="small" color={colors.textMuted} style={{ textDecorationLine: 'line-through' }}>
                    {formatPrice(price!)}
                  </Text>
                )}
              </Row>
            </View>
            {deposit > 0 && (
              <View style={styles.depositPill}>
                <MaterialCommunityIcons name="shield-check" size={16} color={colors.cobalt} />
                <Text variant="small" color={colors.cobalt} weight={fonts.semibold}>
                  מקדמה עכשיו {formatPrice(deposit)}
                </Text>
              </View>
            )}
          </Row>
          <Button
            title={!ready ? 'בחרו שעה' : deposit > 0 ? `המשך לתשלום מקדמה ${formatPrice(deposit)}` : 'אישור וקביעת התור'}
            icon={deposit > 0 ? 'credit-card-lock-outline' : 'check-circle-outline'}
            onPress={submit}
            disabled={!ready}
            loading={submitting}
          />
        </>
      }
    >
      {/* 1. booking type */}
      <Step n={1} title="סוג התור">
        <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
          <TypeOption
            selected={type === 'REGULAR'}
            disabled={!regularOn}
            icon="lightning-bolt"
            title="תור להיום"
            text="משלמים במקום אחרי השטיפה"
            onPress={() => setType('REGULAR')}
          />
          <TypeOption
            selected={type === 'FUTURE'}
            disabled={!futureOn}
            icon="calendar-star"
            title="תור עתידי"
            text={config?.rules.depositAmount ? `שריון בתשלום מקדמה ${formatPrice(config.rules.depositAmount)} שמקוזזת מהמחיר` : 'שריון מראש לכל תאריך'}
            onPress={() => setType('FUTURE')}
          />
        </Row>
      </Step>

      {/* 2. vehicle */}
      <Step n={2} title="איזה רכב נשטוף?">
        {vehicles === null ? (
          <ActivityIndicator color={colors.aqua} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, padding: 2 }}>
            {vehicles.map((v) => {
              const on = v.id === vehicleId;
              return (
                <Pressable key={v.id} onPress={() => setVehicleId(v.id)} style={[styles.vehicle, on && styles.vehicleOn]}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <MaterialCommunityIcons name={vehicleIcon(v.vehicleTypeCode)} size={28} color={on ? colors.cobalt : colors.textMuted} />
                    {on && <MaterialCommunityIcons name="check-circle" size={20} color={colors.cobalt} />}
                  </Row>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {v.nickname || v.vehicleTypeName}
                  </Text>
                  <Plate number={v.plateNumber} scale={0.85} />
                </Pressable>
              );
            })}
            <Pressable onPress={() => setAddingVehicle(true)} style={[styles.vehicle, styles.addVehicle]}>
              <MaterialCommunityIcons name="plus-circle-outline" size={30} color={colors.cobalt} />
              <Text variant="small" color={colors.cobalt} weight={fonts.semibold}>
                הוספת רכב
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </Step>

      {/* 3. service */}
      <Step n={3} title="בחירת שטיפה">
        <View style={{ gap: 10 }}>
          {config?.services.map((s) => {
            const on = s.code === serviceCode;
            const p = vehicle ? priceOf(vehicle.vehicleTypeCode, s.code) : null;
            return (
              <Pressable key={s.code} onPress={() => setServiceCode(s.code)} style={[styles.service, on && styles.serviceOn]}>
                <IconBadge icon={serviceIcon(s.code)} background={on ? colors.cobalt : colors.infoSoft} color={on ? '#fff' : colors.cobalt} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={6}>
                    <Text variant="h3">{s.nameHe}</Text>
                    {s.code === 'FULL' && (
                      <View style={styles.popular}>
                        <Text variant="caption" color="#9A6700">
                          הכי משתלם
                        </Text>
                      </View>
                    )}
                  </Row>
                  <Text variant="small" color={colors.textSoft} numberOfLines={2}>
                    {s.descriptionHe}
                  </Text>
                  <Text variant="caption" color={colors.textMuted}>
                    כ-{s.durationMinutes} דקות
                  </Text>
                </View>
                <Text variant="h2" color={on ? colors.cobalt : colors.text}>
                  {p !== null ? formatPrice(p) : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {canRedeem && (
          <Row style={styles.redeem}>
            <MaterialCommunityIcons name="gift" size={24} color="#B7791F" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">מימוש שטיפה מתנה</Text>
              <Text variant="small" color={colors.textSoft}>
                צברת {loyalty!.punches} שטיפות - שטיפה חיצונית עלינו
              </Text>
            </View>
            <Toggle label="מימוש שטיפה מתנה" value={useLoyalty} onChange={setUseLoyalty} />
          </Row>
        )}
      </Step>

      {addonsOn && (
        <View style={{ gap: 10 }}>
          <Row gap={8}>
            <MaterialCommunityIcons name="star-plus-outline" size={20} color={colors.cobalt} />
            <Text variant="h3">תוספות מומלצות</Text>
            <Text variant="small" color={colors.textMuted}>
              (לא חובה)
            </Text>
          </Row>
          <View style={styles.addons}>
            {config!.addons.map((a) => {
              const on = addonCodes.includes(a.code);
              return (
                <Pressable
                  key={a.code}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${a.nameHe}, ${a.price} שקלים`}
                  onPress={() => setAddonCodes((list) => (on ? list.filter((c) => c !== a.code) : [...list, a.code]))}
                  style={[styles.addon, on && styles.addonOn]}
                >
                  <Row style={{ justifyContent: 'space-between' }}>
                    <MaterialCommunityIcons name={on ? 'checkbox-marked-circle' : 'plus-circle-outline'} size={22} color={on ? colors.cobalt : colors.textMuted} />
                    <Text variant="bodyStrong" color={on ? colors.cobalt : colors.text}>
                      +{formatPrice(a.price)}
                    </Text>
                  </Row>
                  <Text variant="bodyStrong">{a.nameHe}</Text>
                  <Text variant="caption" color={colors.textMuted} numberOfLines={2}>
                    {a.descriptionHe}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* 4. date */}
      {type === 'FUTURE' && (
        <Step n={4} title="באיזה יום?">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 2 }}>
            {futureDays.map((d) => {
              const on = d.date === date;
              return (
                <Pressable key={d.date} disabled={!d.open} onPress={() => setDate(d.date)} style={[styles.day, on && styles.dayOn, !d.open && { opacity: 0.35 }]}>
                  {on && <LinearGradient colors={gradients.primary} style={StyleSheet.absoluteFill} />}
                  <Text variant="caption" color={on ? colors.onDarkSoft : colors.textMuted}>
                    {DAY_SHORT[dayOfWeek(d.date)]}
                  </Text>
                  <Text variant="h2" color={on ? '#fff' : colors.text}>
                    {dayOfMonth(d.date)}
                  </Text>
                  <Text variant="caption" color={on ? colors.onDarkSoft : colors.textMuted}>
                    {d.open ? monthName(d.date) : 'סגור'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Step>
      )}

      {/* 5. time */}
      <Step n={type === 'FUTURE' ? 5 : 4} title={type === 'REGULAR' ? 'באיזו שעה היום?' : 'באיזו שעה?'}>
        {!serviceCode ? (
          <Text color={colors.textMuted}>בחרו שטיפה כדי לראות שעות פנויות</Text>
        ) : loadingSlots ? (
          <ActivityIndicator color={colors.aqua} style={{ padding: 20 }} />
        ) : availability && !availability.isOpen ? (
          <Notice icon="store-off-outline" text={availability.reason ?? 'העסק סגור בתאריך זה'} />
        ) : freeSlots.length === 0 ? (
          <Notice
            icon="clock-alert-outline"
            text={type === 'REGULAR' ? 'אין יותר תורים פנויים היום. נסו תור עתידי' : 'היום הזה מלא. בחרו יום אחר'}
          />
        ) : (
          <View style={styles.slots}>
            {slots.map((s) => {
              const on = s.time === time;
              return (
                <Pressable key={s.time} disabled={!s.available} onPress={() => setTime(s.time)} style={[styles.slot, on && styles.slotOn, !s.available && styles.slotOff]}>
                  <Text variant="bodyStrong" color={on ? '#fff' : s.available ? colors.text : colors.textMuted} style={!s.available && { textDecorationLine: 'line-through' }}>
                    {s.time}
                  </Text>
                  {s.available && s.remaining === 1 && !on && <View style={styles.lastDot} />}
                </Pressable>
              );
            })}
          </View>
        )}
        {freeSlots.some((s) => s.remaining === 1) && (
          <Row gap={6}>
            <View style={styles.lastDot} />
            <Text variant="caption" color={colors.textMuted}>
              נשאר מקום אחרון
            </Text>
          </Row>
        )}
      </Step>

      {f?.ACCESSIBILITY_REQUESTS && (
        <Row style={styles.a11y}>
          <MaterialCommunityIcons name="wheelchair-accessibility" size={24} color={colors.cobalt} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">אני זקוק/ה לסיוע נגישות</Text>
            <Text variant="small" color={colors.textSoft}>
              חניה נגישה, עזרה בהגעה או כל התאמה אחרת - הצוות ייערך מראש
            </Text>
          </View>
          <Toggle label="סיוע נגישות" value={needsAccessibility} onChange={setNeedsAccessibility} />
        </Row>
      )}

      {type === 'FUTURE' && deposit > 0 && (
        <Row style={styles.policy}>
          <MaterialCommunityIcons name="information-outline" size={20} color={colors.ocean} />
          <Text variant="small" color={colors.navy} style={{ flex: 1 }}>
            המקדמה ({formatPrice(deposit)}) מקוזזת מהמחיר ביום השטיפה. ביטול עד {config?.rules.cancelFreeHours} שעות לפני התור - המקדמה מוחזרת במלואה.
            אי-הגעה או ביטול מאוחר - המקדמה לא מוחזרת. <LegalLink docKey="CANCELLATION">מדיניות מלאה</LegalLink>
          </Text>
        </Row>
      )}
      <Text variant="small" color={colors.textMuted} align="center">
        המחירים כוללים מע״מ. בקביעת התור אתם מאשרים את <LegalLink docKey="TERMS">התקנון</LegalLink>, כולל ההנחיות על מצב הרכב וחפצי ערך.
      </Text>

      <AddVehicleSheet
        visible={addingVehicle}
        onClose={() => setAddingVehicle(false)}
        onAdded={async (id) => {
          setAddingVehicle(false);
          await loadVehicles();
          setVehicleId(id);
          toast('הרכב נוסף');
        }}
      />
    </Screen>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Row gap={10}>
        <View style={styles.stepNum}>
          <Text variant="caption" color="#fff">
            {n}
          </Text>
        </View>
        <Text variant="h3">{title}</Text>
      </Row>
      {children}
    </View>
  );
}

function TypeOption({
  selected,
  disabled,
  icon,
  title,
  text,
  onPress,
}: {
  selected: boolean;
  disabled: boolean;
  icon: 'lightning-bolt' | 'calendar-star';
  title: string;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.typeOption, selected && styles.typeOn, disabled && { opacity: 0.45 }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <MaterialCommunityIcons name={icon} size={26} color={selected ? colors.cobalt : colors.textMuted} />
        <MaterialCommunityIcons name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? colors.cobalt : colors.lineStrong} />
      </Row>
      <Text variant="h3">{title}</Text>
      <Text variant="small" color={colors.textSoft}>
        {disabled ? 'לא זמין כרגע' : text}
      </Text>
    </Pressable>
  );
}

function Notice({ icon, text }: { icon: 'store-off-outline' | 'clock-alert-outline'; text: string }) {
  return (
    <Row style={styles.notice}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.warning} />
      <Text color={colors.text} style={{ flex: 1 }}>
        {text}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
  typeOption: {
    flex: 1,
    gap: 8,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    minHeight: 132,
  },
  typeOn: { borderColor: colors.cobalt, backgroundColor: '#F5F9FF', ...shadows.sm },
  vehicle: {
    width: 150,
    padding: 14,
    gap: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  vehicleOn: { borderColor: colors.cobalt, backgroundColor: '#F5F9FF' },
  addVehicle: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: '#A9C7F5', width: 120 },
  service: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  serviceOn: { borderColor: colors.cobalt, backgroundColor: '#F5F9FF', ...shadows.sm },
  popular: { backgroundColor: '#FFF4D6', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  redeem: { backgroundColor: '#FFF8E6', borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: '#FFE3A3' },
  day: {
    width: 64,
    height: 84,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    overflow: 'hidden',
  },
  dayOn: { borderColor: 'transparent', ...shadows.glow },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    width: '23%',
    maxWidth: 110,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotOn: { backgroundColor: colors.navy, borderColor: colors.navy },
  slotOff: { backgroundColor: 'transparent', borderColor: 'transparent' },
  lastDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning, position: 'relative' },
  notice: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 14 },
  policy: { backgroundColor: colors.foam, borderRadius: radius.md, padding: 14, alignItems: 'flex-start' },
  addons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addon: { width: '48%', flexGrow: 1, padding: 12, gap: 4, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  addonOn: { borderColor: colors.cobalt, backgroundColor: '#F5F9FF' },
  a11y: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.line },
  depositPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.infoSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
});
