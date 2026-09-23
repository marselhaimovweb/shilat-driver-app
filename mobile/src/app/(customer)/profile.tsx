import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { api } from '../../api';
import { AddVehicleSheet } from '../../components/AddVehicleSheet';
import { Button, IconButton } from '../../components/Button';
import { Field, Toggle } from '../../components/Controls';
import { Plate, vehicleIcon } from '../../components/Domain';
import { Card, Divider, Hero, IconBadge, Row, Screen, SectionTitle } from '../../components/Layout';
import { Text } from '../../components/Text';
import { formatPhone } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { useConfig } from '../../state/config';
import { useFeedback } from '../../state/feedback';
import { useSession } from '../../state/session';
import { colors, gradients, radius, space } from '../../theme';

export default function Profile() {
  const { signOut, signIn, session } = useSession();
  const { config } = useConfig();
  const { confirm, toast } = useFeedback();
  const me = useAsync(() => api.getMe(), []);
  const vehicles = useAsync(() => api.listVehicles(), []);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      me.reload();
      vehicles.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useEffect(() => {
    if (me.data) {
      setName(me.data.fullName ?? '');
      setEmail(me.data.email ?? '');
    }
  }, [me.data]);

  async function save() {
    setSaving(true);
    try {
      await api.updateMe({ fullName: name.trim(), email: email.trim() });
      if (session) await signIn({ ...session, name: name.trim() });
      toast('הפרטים נשמרו');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeVehicle(id: number) {
    if (!(await confirm({ title: 'להסיר את הרכב?', confirmText: 'הסרה', destructive: true }))) return;
    await api.deleteVehicle(id);
    vehicles.reload();
  }

  async function logout() {
    if (!(await confirm({ title: 'להתנתק מהחשבון?', confirmText: 'התנתקות' }))) return;
    await signOut();
    router.replace('/welcome');
  }

  const m = me.data;
  return (
    <Screen
      header={
        <Hero compact>
          <Row gap={14}>
            <View style={styles.avatar}>
              <LinearGradient colors={gradients.primary} style={StyleSheet.absoluteFill} />
              <Text variant="h1" color="#fff">
                {(m?.fullName ?? '?')[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="h1" color="#fff">
                {m?.fullName ?? ''}
              </Text>
              <Text color={colors.onDarkSoft}>{m ? formatPhone(m.phone) : ''}</Text>
            </View>
          </Row>
          <Row gap={10}>
            <HeroStat value={String(m?.completedWashes ?? 0)} label="שטיפות" />
            <HeroStat value={String(vehicles.data?.length ?? 0)} label="רכבים" />
            {config?.features.LOYALTY_PROGRAM && <HeroStat value={`${m?.loyaltyPunches ?? 0}/${config.rules.loyaltyPunchesForFree}`} label="כרטיסייה" />}
          </Row>
        </Hero>
      }
    >
      <SectionTitle title="הרכבים שלי" action="הוספה" onAction={() => setAdding(true)} />
      <Card padded={false}>
        {(vehicles.data ?? []).map((v, i) => (
          <View key={v.id}>
            {i > 0 && <Divider />}
            <Row style={{ padding: space.md }}>
              <IconBadge icon={vehicleIcon(v.vehicleTypeCode)} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="bodyStrong">{v.nickname || v.vehicleTypeName}</Text>
                <Plate number={v.plateNumber} scale={0.8} />
              </View>
              <IconButton icon="trash-can-outline" label="הסרת רכב" color={colors.danger} background={colors.dangerSoft} size={36} onPress={() => removeVehicle(v.id)} />
            </Row>
          </View>
        ))}
        {vehicles.data?.length === 0 && (
          <Pressable onPress={() => setAdding(true)} style={{ padding: space.lg, alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="car-2-plus" size={32} color={colors.cobalt} />
            <Text color={colors.cobalt}>הוסיפו את הרכב הראשון</Text>
          </Pressable>
        )}
      </Card>

      <SectionTitle title="פרטים אישיים" />
      <Card style={{ gap: 14 }}>
        <Field label="שם מלא" icon="account-outline" value={name} onChangeText={setName} />
        <Field label="אימייל (לקבלות)" icon="email-outline" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">עדכונים ומבצעים</Text>
            <Text variant="small" color={colors.textSoft}>
              קבלת הודעות על מבצעים והטבות
            </Text>
          </View>
          <Toggle
            value={!!m?.marketingOptIn}
            onChange={async (v) => {
              await api.updateMe({ marketingOptIn: v });
              me.reload();
            }}
          />
        </Row>
        <Button title="שמירת פרטים" variant="secondary" size="md" onPress={save} loading={saving} />
      </Card>

      <SectionTitle title="יצירת קשר" />
      <Card padded={false}>
        <MenuItem icon="phone-outline" label={`התקשרו אלינו · ${config?.business.phone ?? ''}`} onPress={() => Linking.openURL(`tel:${config?.business.phone}`)} />
        <Divider />
        <MenuItem icon="whatsapp" label="שלחו הודעת WhatsApp" onPress={() => Linking.openURL(`https://wa.me/972${(config?.business.phone ?? '').replace(/\D/g, '').slice(1)}`)} />
        <Divider />
        <MenuItem icon="map-marker-outline" label={config?.business.address ?? ''} onPress={() => Linking.openURL(`https://waze.com/ul?q=${encodeURIComponent(config?.business.address ?? '')}`)} />
      </Card>

      <Button title="התנתקות" variant="ghost" icon="logout" onPress={logout} />
      <Text variant="caption" color={colors.textMuted} align="center">
        {api.mode === 'demo' ? 'מצב הדגמה · ' : ''}גרסה 1.0.0
      </Text>

      <AddVehicleSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          vehicles.reload();
          toast('הרכב נוסף');
        }}
      />
    </Screen>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text variant="h2" color="#fff">
        {value}
      </Text>
      <Text variant="caption" color={colors.onDarkSoft}>
        {label}
      </Text>
    </View>
  );
}

function MenuItem({ icon, label, onPress }: { icon: 'phone-outline' | 'whatsapp' | 'map-marker-outline'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md }, pressed && { backgroundColor: colors.mist }]}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.cobalt} />
      <Text style={{ flex: 1 }}>{label}</Text>
      <MaterialCommunityIcons name="chevron-left" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  heroStat: { flex: 1, backgroundColor: colors.glass, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.glassLine },
});
