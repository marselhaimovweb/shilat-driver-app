import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { Button } from '../components/Button';
import { CarArt } from '../components/CarArt';
import { Row } from '../components/Layout';
import { Text } from '../components/Text';
import { Bubbles, Sparkle } from '../components/Water';
import { useConfig } from '../state/config';
import { useSession } from '../state/session';
import { colors, fonts, gradients, radius, space } from '../theme';

const PERKS = [
  { icon: 'lightning-bolt' as const, label: 'תור להיום\nבשניות' },
  { icon: 'calendar-star' as const, label: 'תור עתידי\nמובטח' },
  { icon: 'gift-outline' as const, label: 'כרטיסיית\nמועדון' },
];

export default function Welcome() {
  const { session } = useSession();
  const { config } = useConfig();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [size, setSize] = useState({ w: width, h: height });

  if (session) return <Redirect href={session.role === 'admin' ? '/admin' : '/'} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, overflow: 'hidden' }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <LinearGradient colors={['#135C97', '#0B2C4B', '#04121F']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <Bubbles width={size.w} height={size.h * 0.6} />
      <View style={[styles.glow, { width: size.w * 1.2, height: size.w * 1.2, borderRadius: size.w * 0.6, top: size.h * 0.18 }]} />

      <View style={{ flex: 1, paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: Math.max(insets.bottom, 20) + 8, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={8}>
            <View style={styles.logo}>
              <LinearGradient colors={gradients.primary} style={StyleSheet.absoluteFill} />
              <MaterialCommunityIcons name="water" size={20} color="#fff" />
            </View>
            <Text variant="h3" color={colors.onDark}>
              {config?.business.name ?? 'אקווה שיין'}
            </Text>
          </Row>
          {api.mode === 'demo' && (
            <View style={styles.demo}>
              <Text variant="caption" color={colors.gold}>
                מצב הדגמה
              </Text>
            </View>
          )}
        </Row>

        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          <View style={{ alignItems: 'center' }}>
            <CarArt width={Math.max(220, Math.min(size.w - 48, 360))} />
          </View>
          <View style={{ gap: 12 }}>
            <Row gap={8}>
              <Sparkle size={16} color={colors.aqua} />
              <Text variant="caption" color={colors.aquaSoft}>
                שטיפת רכבים פרימיום
              </Text>
            </Row>
            <Text variant="display" color={colors.onDark} style={{ fontSize: 38, lineHeight: 46 }}>
              הרכב שלך.{'\n'}
              <Text variant="display" color={colors.aqua} style={{ fontSize: 38, lineHeight: 46 }}>
                מבריק.
              </Text>{' '}
              בלי תורים.
            </Text>
            <Text color={colors.onDarkSoft} style={{ maxWidth: 340 }}>
              קובעים תור בכמה הקשות, מגיעים בזמן ונוסעים עם רכב נוצץ. אנחנו כבר מחכים עם הקצף.
            </Text>
          </View>
          <Row gap={10}>
            {PERKS.map((p) => (
              <View key={p.icon} style={styles.perk}>
                <MaterialCommunityIcons name={p.icon} size={22} color={colors.aqua} />
                <Text variant="small" color={colors.onDarkSoft} align="center" weight={fonts.medium}>
                  {p.label}
                </Text>
              </View>
            ))}
          </Row>
        </View>

        <View style={{ gap: 14 }}>
          <Button title="כניסה עם מספר טלפון" icon="cellphone-message" onPress={() => router.push('/login')} />
          <Pressable onPress={() => router.push('/admin-login')} hitSlop={10} style={{ alignSelf: 'center', padding: 6 }}>
            <Row gap={6}>
              <MaterialCommunityIcons name="shield-account-outline" size={18} color={colors.onDarkMuted} />
              <Text variant="small" color={colors.onDarkMuted}>
                כניסת מנהל העסק
              </Text>
            </Row>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', alignSelf: 'center', backgroundColor: '#16C7F2', opacity: 0.08 },
  logo: { width: 36, height: 36, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  demo: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,201,60,0.4)' },
  perk: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassLine,
  },
});
