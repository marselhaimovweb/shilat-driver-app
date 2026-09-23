import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { api, ApiError } from '../../api';
import { serviceIcon, LoyaltyCard, StatusBadge } from '../../components/Domain';
import { Card, Hero, IconBadge, Row, Screen, SectionTitle } from '../../components/Layout';
import { Text } from '../../components/Text';
import { dayOfWeek, formatRelativeDay, greeting, minutesUntil, today } from '../../lib/dates';
import { formatPrice } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useConfig } from '../../state/config';
import { useSession } from '../../state/session';
import { colors, fonts, gradients, radius, shadows, space } from '../../theme';

export default function Home() {
  const { session, signOut } = useSession();
  const { config, reload } = useConfig();
  const data = useAsync(async () => {
    try {
      const [me, upcoming, loyalty] = await Promise.all([api.getMe(), api.listMyAppointments('upcoming'), api.getLoyalty()]);
      return { me, next: upcoming[0] ?? null, loyalty };
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await signOut();
      throw e;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      data.reload();
      reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const f = config?.features;
  const bookingOpen = !!f?.BOOKING_SYSTEM;
  const firstName = (data.data?.me.fullName ?? session?.name ?? '').split(' ')[0];
  const next = data.data?.next;
  const todayHours = config?.businessHours.find((h) => h.dayOfWeek === dayOfWeek(today()));
  const minPrice = (code: string) => Math.min(...(config?.prices.filter((p) => p.serviceCode === code).map((p) => p.price) ?? [0]));

  return (
    <Screen
      refreshing={data.refreshing}
      onRefresh={() => {
        data.refresh();
        reload();
      }}
      header={
        <Hero>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ gap: 4, flex: 1 }}>
              <Text variant="caption" color={colors.aquaSoft}>
                {config?.business.name}
              </Text>
              <Text variant="h1" color={colors.onDark}>
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => router.push('/profile')} style={styles.avatar}>
              <LinearGradient colors={gradients.primary} style={StyleSheet.absoluteFill} />
              <Text variant="h3" color="#fff">
                {firstName ? firstName[0] : '?'}
              </Text>
            </Pressable>
          </Row>

          {next ? (
            <Pressable onPress={() => router.push('/appointments')} style={styles.nextCard}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="caption" color={colors.aquaSoft}>
                  התור הבא שלך
                </Text>
                <StatusBadge status={next.status} />
              </Row>
              <Row style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View style={{ gap: 2 }}>
                  <Text variant="display" color={colors.onDark}>
                    {next.time}
                  </Text>
                  <Text color={colors.onDarkSoft}>
                    {formatRelativeDay(next.date)} · {next.serviceName}
                  </Text>
                </View>
                <Countdown date={next.date} time={next.time} />
              </Row>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push('/book')} style={styles.nextCard} disabled={!bookingOpen}>
              <Row>
                <View style={styles.ctaIcon}>
                  <MaterialCommunityIcons name="car-wash" size={26} color={colors.aqua} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h3" color={colors.onDark}>
                    {bookingOpen ? 'הרכב מתגעגע לקצף?' : 'ההזמנות סגורות כרגע'}
                  </Text>
                  <Text variant="small" color={colors.onDarkSoft}>
                    {bookingOpen ? 'קבעו תור עכשיו - לוקח פחות מדקה' : 'נחזור לפעילות בקרוב, תודה על הסבלנות'}
                  </Text>
                </View>
                {bookingOpen && <MaterialCommunityIcons name="chevron-left" size={26} color={colors.onDarkSoft} />}
              </Row>
            </Pressable>
          )}
        </Hero>
      }
    >
      {!!config?.business.announcement && (
        <View style={styles.announcement}>
          <MaterialCommunityIcons name="bullhorn-variant-outline" size={20} color={colors.ocean} />
          <Text variant="small" color={colors.navy} style={{ flex: 1 }} weight={fonts.medium}>
            {config.business.announcement}
          </Text>
        </View>
      )}

      <View style={{ gap: space.md }}>
        <SectionTitle title="קביעת תור" />
        <Row gap={space.sm} style={{ alignItems: 'stretch' }}>
          <QuickAction
            icon="lightning-bolt"
            title="תור להיום"
            subtitle="תשלום במקום"
            enabled={bookingOpen && !!f?.REGULAR_BOOKING}
            onPress={() => router.push({ pathname: '/book', params: { type: 'REGULAR' } })}
            tone="aqua"
          />
          <QuickAction
            icon="calendar-star"
            title="תור עתידי"
            subtitle={config?.rules.depositAmount ? `מקדמה ${formatPrice(config.rules.depositAmount)} בלבד` : 'שריון מראש'}
            enabled={bookingOpen && !!f?.FUTURE_BOOKING}
            onPress={() => router.push({ pathname: '/book', params: { type: 'FUTURE' } })}
            tone="deep"
          />
        </Row>
      </View>

      {f?.LOYALTY_PROGRAM && data.data?.loyalty && (
        <LoyaltyCard punches={data.data.loyalty.punches} needed={data.data.loyalty.punchesForFree} onRedeem={() => router.push('/book')} />
      )}

      <View style={{ gap: space.md }}>
        <SectionTitle title="השירותים שלנו" action="למחירון המלא" onAction={() => router.push('/prices')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingVertical: 6, paddingHorizontal: 2 }}>
          {config?.services.map((s) => (
            <Card key={s.code} style={styles.serviceCard} onPress={() => router.push({ pathname: '/book', params: { service: s.code } })}>
              <IconBadge icon={serviceIcon(s.code)} />
              <Text variant="h3">{s.nameHe}</Text>
              <Text variant="small" color={colors.textSoft} numberOfLines={2}>
                {s.descriptionHe}
              </Text>
              <Row style={{ justifyContent: 'space-between', marginTop: 'auto' }}>
                <Text variant="small" color={colors.textMuted}>
                  {s.durationMinutes} דק׳
                </Text>
                <Text variant="h3" color={colors.cobalt}>
                  החל מ-{formatPrice(minPrice(s.code))}
                </Text>
              </Row>
            </Card>
          ))}
        </ScrollView>
      </View>

      <Card style={{ gap: 14 }}>
        <Row>
          <IconBadge icon="map-marker-radius-outline" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{config?.business.address}</Text>
            <Text variant="small" color={colors.textSoft}>
              {todayHours?.isOpen ? `פתוח היום ${todayHours.openTime}-${todayHours.closeTime}` : 'סגור היום'}
            </Text>
          </View>
        </Row>
        <Row gap={10}>
          <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${config?.business.phone}`)}>
            <MaterialCommunityIcons name="phone-outline" size={18} color={colors.cobalt} />
            <Text variant="small" weight={fonts.semibold} color={colors.cobalt}>
              התקשרו
            </Text>
          </Pressable>
          <Pressable
            style={styles.contactBtn}
            onPress={() => Linking.openURL(`https://waze.com/ul?q=${encodeURIComponent(config?.business.address ?? '')}`)}
          >
            <MaterialCommunityIcons name="navigation-variant-outline" size={18} color={colors.cobalt} />
            <Text variant="small" weight={fonts.semibold} color={colors.cobalt}>
              נווטו עם Waze
            </Text>
          </Pressable>
        </Row>
      </Card>
    </Screen>
  );
}

function Countdown({ date, time }: { date: string; time: string }) {
  const minutes = minutesUntil(date, time);
  if (minutes <= 0) return null;
  const label = minutes < 60 ? `${minutes} דק׳` : minutes < 1440 ? `${Math.floor(minutes / 60)} שע׳` : `${Math.floor(minutes / 1440)} ימים`;
  return (
    <View style={styles.countdown}>
      <Text variant="caption" color={colors.onDarkSoft}>
        בעוד
      </Text>
      <Text variant="h3" color={colors.aqua}>
        {label}
      </Text>
    </View>
  );
}

function QuickAction({
  icon,
  title,
  subtitle,
  enabled,
  onPress,
  tone,
}: {
  icon: 'lightning-bolt' | 'calendar-star';
  title: string;
  subtitle: string;
  enabled: boolean;
  onPress: () => void;
  tone: 'aqua' | 'deep';
}) {
  return (
    <Pressable
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.quick, shadows.md, { opacity: enabled ? 1 : 0.55, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <LinearGradient colors={tone === 'aqua' ? gradients.primary : gradients.hero} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.quickIcon}>
        <MaterialCommunityIcons name={icon} size={24} color="#fff" />
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="h3" color="#fff">
          {title}
        </Text>
        <Text variant="small" color={colors.onDarkSoft}>
          {enabled ? subtitle : 'לא זמין כרגע'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  nextCard: {
    backgroundColor: colors.glass,
    borderColor: colors.glassLine,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.sm,
  },
  ctaIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(22,199,242,0.15)', alignItems: 'center', justifyContent: 'center' },
  countdown: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: 'rgba(22,199,242,0.12)' },
  announcement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.foam,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: '#C9EEFA',
  },
  quick: { flex: 1, borderRadius: radius.xl, overflow: 'hidden', padding: space.lg, gap: space.lg, minHeight: 150 },
  quickIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  serviceCard: { width: 220, gap: 8, minHeight: 190 },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.infoSoft,
  },
});
