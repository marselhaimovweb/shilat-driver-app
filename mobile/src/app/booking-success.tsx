import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type Appointment } from '../api';
import { Button, haptic } from '../components/Button';
import { Plate } from '../components/Domain';
import { Divider, InfoLine } from '../components/Layout';
import { Text } from '../components/Text';
import { Bubbles, Sparkle } from '../components/Water';
import { formatDateLong } from '../lib/dates';
import { BOOKING_TYPE_LABEL, formatPrice } from '../lib/format';
import { useConfig } from '../state/config';
import { colors, gradients, radius, shadows, space } from '../theme';

export default function BookingSuccess() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { config } = useConfig();
  const insets = useSafeAreaInsets();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    haptic('success');
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 60, useNativeDriver: Platform.OS !== 'web' }).start();
    api
      .listMyAppointments('all')
      .then((list) => setAppointment(list.find((a) => String(a.id) === id) ?? null))
      .catch(() => undefined);
  }, [id, pop]);

  const a = appointment;
  return (
    <View style={{ flex: 1 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <LinearGradient colors={gradients.hero} style={StyleSheet.absoluteFill} />
      {size.w > 0 && <Bubbles width={size.w} height={size.h * 0.55} />}
      <View style={{ flex: 1, paddingTop: insets.top + space.xxl, paddingHorizontal: space.lg, paddingBottom: Math.max(insets.bottom, 20), gap: space.xl, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Animated.View style={[styles.check, shadows.glow, { transform: [{ scale: pop }] }]}>
            <LinearGradient colors={gradients.primary} style={StyleSheet.absoluteFill} />
            <MaterialCommunityIcons name="check-bold" size={48} color="#fff" />
          </Animated.View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Sparkle color={colors.aqua} />
            <Text variant="caption" color={colors.aquaSoft}>
              {a ? BOOKING_TYPE_LABEL[a.bookingType] : 'התור'} אושר
            </Text>
            <Sparkle color={colors.aqua} />
          </View>
          <Text variant="display" color="#fff" align="center">
            נתראה בקצף!
          </Text>
          <Text color={colors.onDarkSoft} align="center">
            שלחנו אישור. אפשר לראות ולנהל את התור במסך "התורים שלי".
          </Text>
        </View>

        {a && (
          <View style={[styles.ticket, shadows.lg]}>
            <View style={{ padding: space.lg, gap: 6 }}>
              <Text variant="h2">{a.serviceName}</Text>
              <Text color={colors.textSoft}>
                {formatDateLong(a.date)} · {a.time}
              </Text>
            </View>
            <View style={styles.perforation}>
              <View style={[styles.notch, { right: -12 }]} />
              <Divider style={{ flex: 1, marginHorizontal: 16, backgroundColor: colors.lineStrong }} />
              <View style={[styles.notch, { left: -12 }]} />
            </View>
            <View style={{ padding: space.lg, gap: 4 }}>
              <InfoLine icon="car-outline" label="רכב" value={<Plate number={a.plateNumber} scale={0.9} />} />
              <InfoLine icon="cash" label="מחיר" value={formatPrice(a.price - a.discountAmount)} />
              {a.depositAmount > 0 && <InfoLine icon="shield-check-outline" label="מקדמה ששולמה" value={formatPrice(a.depositAmount)} />}
              <InfoLine icon="wallet-outline" label="לתשלום במקום" value={formatPrice(Math.max(0, a.price - a.discountAmount - (a.depositStatus === 'PAID' ? a.depositAmount : 0)))} strong />
              {!!config?.business.address && <InfoLine icon="map-marker-outline" label="כתובת" value={config.business.address} />}
            </View>
          </View>
        )}

        <View style={{ marginTop: 'auto', gap: 10 }}>
          <Button title="לתורים שלי" icon="calendar-check" onPress={() => router.replace('/appointments')} />
          <Button title="חזרה לדף הבית" variant="glass" onPress={() => router.replace('/')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  check: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ticket: { backgroundColor: colors.surface, borderRadius: radius.xl },
  perforation: { height: 24, flexDirection: 'row', alignItems: 'center' },
  notch: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#0A2A48' },
});
