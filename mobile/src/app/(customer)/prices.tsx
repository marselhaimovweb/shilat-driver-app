import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Controls';
import { serviceIcon, vehicleIcon } from '../../components/Domain';
import { Card, Hero, IconBadge, Row, Screen } from '../../components/Layout';
import { Text } from '../../components/Text';
import { DAY_NAMES } from '../../lib/dates';
import { formatPrice } from '../../lib/format';
import { useConfig } from '../../state/config';
import { colors, gradients, radius, space } from '../../theme';

const INCLUDED: Record<string, string[]> = {
  EXTERIOR: ['שטיפה בקצף פעיל', 'ניקוי חישוקים וצמיגים', 'ייבוש במיקרופייבר', 'ניקוי חלונות מבחוץ'],
  INTERIOR: ['שאיבת אבק יסודית', 'ניקוי דשבורד וקונסולה', 'ניקוי חלונות מבפנים', 'ניקוי שטיחונים'],
  FULL: ['כל מה שבשטיפה החיצונית', 'כל מה שבניקוי הפנימי', 'ריח רענן לרכב', 'חיסכון לעומת הזמנה נפרדת'],
};

export default function Prices() {
  const { config } = useConfig();
  const [vehicle, setVehicle] = useState(config?.vehicleTypes[0]?.code ?? 'PRIVATE');
  const price = (s: string) => config?.prices.find((p) => p.vehicleTypeCode === vehicle && p.serviceCode === s)?.price;

  return (
    <Screen
      header={
        <Hero back eyebrow="שקיפות מלאה" title="המחירון שלנו" subtitle="בלי הפתעות. המחירים כוללים מע״מ." compact>
          <Segmented
            tone="dark"
            value={vehicle}
            onChange={setVehicle}
            options={(config?.vehicleTypes ?? []).map((v) => ({ value: v.code, label: v.nameHe, icon: vehicleIcon(v.code) }))}
          />
        </Hero>
      }
    >
      {config?.services.map((s) => {
        const featured = s.code === 'FULL';
        return (
          <View key={s.code} style={[styles.card, featured && styles.featured]}>
            {featured && <LinearGradient colors={gradients.hero} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />}
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Row>
                <IconBadge icon={serviceIcon(s.code)} background={featured ? 'rgba(22,199,242,0.18)' : colors.infoSoft} color={featured ? colors.aqua : colors.cobalt} />
                <View>
                  <Text variant="h2" color={featured ? '#fff' : colors.text}>
                    {s.nameHe}
                  </Text>
                  <Text variant="small" color={featured ? colors.onDarkSoft : colors.textMuted}>
                    כ-{s.durationMinutes} דקות
                  </Text>
                </View>
              </Row>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="display" color={featured ? colors.aqua : colors.navy}>
                  {price(s.code) !== undefined ? formatPrice(price(s.code)!) : '—'}
                </Text>
                {featured && (
                  <View style={styles.best}>
                    <Text variant="caption" color={colors.navy}>
                      הכי משתלם
                    </Text>
                  </View>
                )}
              </View>
            </Row>
            <View style={{ gap: 8 }}>
              {(INCLUDED[s.code] ?? [s.descriptionHe ?? '']).map((line) => (
                <Row key={line} gap={8}>
                  <MaterialCommunityIcons name="check-circle" size={18} color={featured ? colors.aqua : colors.success} />
                  <Text color={featured ? colors.onDarkSoft : colors.textSoft}>{line}</Text>
                </Row>
              ))}
            </View>
            <Button
              title="הזמנת שטיפה זו"
              variant={featured ? 'primary' : 'secondary'}
              size="md"
              onPress={() => router.push({ pathname: '/book', params: { service: s.code } })}
            />
          </View>
        );
      })}

      {!!config?.addons.length && config.features.SERVICE_ADDONS && (
        <Card style={{ gap: 10 }}>
          <Row>
            <MaterialCommunityIcons name="star-plus-outline" size={22} color={colors.cobalt} />
            <Text variant="h3">תוספות</Text>
          </Row>
          {config.addons.map((a) => (
            <Row key={a.code} style={{ justifyContent: 'space-between' }}>
              <Text color={colors.textSoft}>{a.nameHe}</Text>
              <Text variant="bodyStrong">+{formatPrice(a.price)}</Text>
            </Row>
          ))}
        </Card>
      )}

      {!!config?.rules.depositAmount && (
        <Row style={styles.note}>
          <MaterialCommunityIcons name="shield-check-outline" size={22} color={colors.ocean} />
          <Text variant="small" color={colors.navy} style={{ flex: 1 }}>
            בתור עתידי נגבית מקדמה של {formatPrice(config.rules.depositAmount)} שמקוזזת מהמחיר. תור להיום - משלמים במקום.
          </Text>
        </Row>
      )}

      <Card style={{ gap: 10 }}>
        <Row>
          <MaterialCommunityIcons name="clock-outline" size={22} color={colors.cobalt} />
          <Text variant="h3">שעות פעילות</Text>
        </Row>
        {config?.businessHours.map((h) => (
          <Row key={h.dayOfWeek} style={{ justifyContent: 'space-between' }}>
            <Text color={colors.textSoft}>יום {DAY_NAMES[h.dayOfWeek]}</Text>
            <Text variant="bodyStrong" color={h.isOpen ? colors.text : colors.textMuted}>
              {h.isOpen ? `${h.openTime} - ${h.closeTime}` : 'סגור'}
            </Text>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.lg, gap: space.md, overflow: 'hidden' },
  featured: { borderWidth: 0 },
  best: { backgroundColor: colors.aqua, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  note: { backgroundColor: colors.foam, borderRadius: radius.md, padding: 14 },
});
