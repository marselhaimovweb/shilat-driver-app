import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { api, type FeatureFlag } from '../../api';
import { Toggle } from '../../components/Controls';
import { serviceIcon, vehicleIcon } from '../../components/Domain';
import { Card, Divider, ErrorState, Hero, IconBadge, Loader, Row, Screen, SectionTitle } from '../../components/Layout';
import { Text } from '../../components/Text';
import { useAsync } from '../../lib/useAsync';
import { useConfig } from '../../state/config';
import { useFeedback } from '../../state/feedback';
import { colors, radius, space } from '../../theme';

const GROUP_ICON: Record<string, 'calendar-check-outline' | 'credit-card-outline' | 'account-group-outline' | 'message-text-outline'> = {
  הזמנות: 'calendar-check-outline',
  תשלומים: 'credit-card-outline',
  לקוחות: 'account-group-outline',
  תקשורת: 'message-text-outline',
};

/** Every system in the app has its own on/off switch. */
export default function Systems() {
  const { toast, confirm } = useFeedback();
  const { reload: reloadConfig } = useConfig();
  const flags = useAsync(() => api.listFeatures(), []);
  const catalog = useAsync(() => api.getCatalog(), []);

  async function toggle(flag: FeatureFlag, value: boolean) {
    if (flag.key === 'BOOKING_SYSTEM' && !value) {
      const ok = await confirm({
        title: 'לכבות את מערכת התורים?',
        message: 'לקוחות לא יוכלו לקבוע תורים חדשים באפליקציה. תורים קיימים לא יושפעו.',
        confirmText: 'כיבוי המערכת',
        destructive: true,
      });
      if (!ok) return;
    }
    flags.setData((list) => list?.map((f) => (f.key === flag.key ? { ...f, isEnabled: value } : f)));
    try {
      await api.setFeature(flag.key, value);
      toast(`${flag.nameHe} ${value ? 'הופעל' : 'כובה'}`, value ? 'success' : 'info');
      reloadConfig();
    } catch (e) {
      flags.reload();
      toast((e as Error).message, 'error');
    }
  }

  const master = flags.data?.find((f) => f.key === 'BOOKING_SYSTEM');
  const groups = Array.from(new Set((flags.data ?? []).filter((f) => f.key !== 'BOOKING_SYSTEM').map((f) => f.groupName)));

  return (
    <Screen header={<Hero back eyebrow="שליטה מלאה" title="מתגי מערכות" subtitle="הפעילו או כבו כל מערכת בלחיצה. השינוי מיידי אצל כל הלקוחות." compact />}>
      {flags.loading ? (
        <Loader />
      ) : flags.error ? (
        <ErrorState message={flags.error} onRetry={flags.reload} />
      ) : (
        <>
          {master && (
            <Card style={{ gap: 12, borderWidth: 2, borderColor: master.isEnabled ? colors.success : colors.danger }}>
              <Row>
                <IconBadge
                  icon={master.isEnabled ? 'power' : 'power-off'}
                  color={master.isEnabled ? colors.success : colors.danger}
                  background={master.isEnabled ? colors.successSoft : colors.dangerSoft}
                  size={52}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="h2">{master.nameHe}</Text>
                  <Text variant="small" color={master.isEnabled ? colors.success : colors.danger}>
                    {master.isEnabled ? 'פעילה - הלקוחות יכולים להזמין' : 'כבויה - ההזמנות באפליקציה סגורות'}
                  </Text>
                </View>
                <Toggle value={master.isEnabled} onChange={(v) => toggle(master, v)} />
              </Row>
              <Text variant="small" color={colors.textSoft}>
                {master.descriptionHe}
              </Text>
            </Card>
          )}

          {groups.map((g) => (
            <View key={g} style={{ gap: space.md }}>
              <SectionTitle title={g} />
              <Card padded={false}>
                {flags.data!
                  .filter((f) => f.groupName === g && f.key !== 'BOOKING_SYSTEM')
                  .map((f, i) => (
                    <View key={f.key}>
                      {i > 0 && <Divider />}
                      <FlagRow flag={f} icon={GROUP_ICON[g] ?? 'cog-outline'} dimmed={!master?.isEnabled && g === 'הזמנות'} onChange={(v) => toggle(f, v)} />
                    </View>
                  ))}
              </Card>
            </View>
          ))}

          <SectionTitle title="שירותים זמינים להזמנה" />
          <Card padded={false}>
            {catalog.data?.services.map((s, i) => (
              <View key={s.code}>
                {i > 0 && <Divider />}
                <Row style={{ padding: space.md }}>
                  <MaterialCommunityIcons name={serviceIcon(s.code)} size={24} color={s.isActive ? colors.cobalt : colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{s.nameHe}</Text>
                    <Text variant="small" color={colors.textSoft}>
                      {s.durationMinutes} דקות
                    </Text>
                  </View>
                  <Toggle
                    value={s.isActive}
                    onChange={async (v) => {
                      catalog.setData(await api.updateService(s.code, { isActive: v }));
                      reloadConfig();
                      toast(`${s.nameHe} ${v ? 'זמין' : 'הוסתר מהלקוחות'}`, v ? 'success' : 'info');
                    }}
                  />
                </Row>
              </View>
            ))}
          </Card>

          <SectionTitle title="סוגי רכב" />
          <Card padded={false}>
            {catalog.data?.vehicleTypes.map((v, i) => (
              <View key={v.code}>
                {i > 0 && <Divider />}
                <Row style={{ padding: space.md }}>
                  <MaterialCommunityIcons name={vehicleIcon(v.code)} size={24} color={v.isActive ? colors.cobalt : colors.textMuted} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {v.nameHe}
                  </Text>
                  <Toggle
                    value={v.isActive}
                    onChange={async (on) => {
                      catalog.setData(await api.updateVehicleType(v.code, { isActive: on }));
                      reloadConfig();
                    }}
                  />
                </Row>
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}

function FlagRow({ flag, icon, dimmed, onChange }: { flag: FeatureFlag; icon: 'cog-outline' | (typeof GROUP_ICON)[string]; dimmed: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ padding: space.md, opacity: dimmed ? 0.55 : 1, alignItems: 'flex-start' }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: flag.isEnabled ? colors.infoSoft : colors.mist, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name={icon} size={20} color={flag.isEnabled ? colors.cobalt : colors.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{flag.nameHe}</Text>
        <Text variant="small" color={colors.textSoft}>
          {flag.descriptionHe}
        </Text>
      </View>
      <Toggle value={flag.isEnabled} onChange={onChange} />
    </Row>
  );
}
