import { useState } from 'react';
import { View } from 'react-native';
import { api, type AdminRole, type UserRole } from '../../api';
import { Button } from '../../components/Button';
import { Field, Segmented, Toggle } from '../../components/Controls';
import { Tag } from '../../components/Domain';
import { Card, Divider, ErrorState, Hero, IconBadge, Loader, Row, Screen, SectionTitle } from '../../components/Layout';
import { Text } from '../../components/Text';
import { formatPhone } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Sheet, useFeedback } from '../../state/feedback';
import { colors, space } from '../../theme';

const ROLE_LABEL: Record<UserRole, string> = { OWNER: 'בעלים', MANAGER: 'מנהל/ת', STAFF: 'צוות', CUSTOMER: 'לקוח' };
const ROLE_TEXT: Record<AdminRole, string> = {
  OWNER: 'גישה מלאה כולל צוות, סליקה ומסמכים משפטיים',
  MANAGER: 'תורים, חנות, מחירים, מתגים והגדרות',
  STAFF: 'יומן התורים, תור חדש, הזמנות והמלאי בלבד',
};

/** Roles: who is a customer, who works here and who manages the business. */
export default function Team() {
  const team = useAsync(() => api.getTeam(), []);
  const { toast, confirm } = useFeedback();
  const [roleSheet, setRoleSheet] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('STAFF');
  const [panelSheet, setPanelSheet] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function saveRole() {
    try {
      await api.setUserRole(phone, role, name.trim() || undefined);
      toast(`${formatPhone(phone.replace(/\D/g, ''))} הוגדר/ה כ${ROLE_LABEL[role]}`);
      setRoleSheet(false);
      setPhone('');
      setName('');
      team.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function removeRole(p: string, label: string) {
    if (!(await confirm({ title: `להסיר את ההרשאות של ${label}?`, message: 'המשתמש יחזור להיות לקוח רגיל ולא יראה את תפריט הניהול.', confirmText: 'הסרת הרשאות', destructive: true }))) return;
    try {
      await api.setUserRole(p, 'CUSTOMER');
      team.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function createPanelUser() {
    try {
      await api.createPanelUser({ username: username.trim(), fullName: name.trim(), password, role });
      toast('המשתמש נוצר');
      setPanelSheet(false);
      setUsername('');
      setPassword('');
      setName('');
      team.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <Screen header={<Hero back eyebrow="אבטחה" title="צוות והרשאות" subtitle="רק מי שקיבל הרשאה רואה את תפריט הניהול. כל שינוי מתועד ביומן הפעולות." compact />}>
      <Card style={{ gap: 10 }}>
        {(['OWNER', 'MANAGER', 'STAFF'] as AdminRole[]).map((r) => (
          <Row key={r} style={{ alignItems: 'flex-start' }}>
            <Tag label={ROLE_LABEL[r]} color={colors.navy} background={colors.infoSoft} />
            <Text variant="small" color={colors.textSoft} style={{ flex: 1 }}>
              {ROLE_TEXT[r]}
            </Text>
          </Row>
        ))}
      </Card>

      {team.loading ? (
        <Loader />
      ) : team.error ? (
        <ErrorState message={team.error} onRetry={team.reload} />
      ) : (
        <>
          <SectionTitle title="צוות באפליקציה (כניסה עם SMS)" action="הוספה" onAction={() => setRoleSheet(true)} />
          <Card padded={false}>
            {team.data?.staff.map((m, i) => (
              <View key={m.id}>
                {i > 0 && <Divider />}
                <Row style={{ padding: space.md }}>
                  <IconBadge icon={m.role === 'OWNER' ? 'crown-outline' : m.role === 'MANAGER' ? 'shield-account-outline' : 'account-hard-hat-outline'} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{m.fullName || 'ללא שם'}</Text>
                    <Text variant="small" color={colors.textSoft}>
                      {formatPhone(m.phone)} · {ROLE_LABEL[m.role]}
                    </Text>
                  </View>
                  <Button title="הסרה" size="sm" variant="ghost" full={false} onPress={() => removeRole(m.phone, m.fullName || m.phone)} />
                </Row>
              </View>
            ))}
            {!team.data?.staff.length && (
              <Text color={colors.textMuted} style={{ padding: space.md }}>
                עדיין אין אנשי צוות. הוסיפו לפי מספר טלפון - הם ייכנסו לאפליקציה הרגילה ויראו את לשונית "ניהול".
              </Text>
            )}
          </Card>

          <SectionTitle title="משתמשי פאנל (שם משתמש וסיסמה)" action="הוספה" onAction={() => setPanelSheet(true)} />
          <Card padded={false}>
            {team.data?.panelUsers.map((u, i) => (
              <View key={u.id}>
                {i > 0 && <Divider />}
                <Row style={{ padding: space.md, opacity: u.isActive ? 1 : 0.5 }}>
                  <IconBadge icon="monitor-account" size={40} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{u.fullName}</Text>
                    <Text variant="small" color={colors.textSoft}>
                      {u.username} · {ROLE_LABEL[u.role]}
                    </Text>
                  </View>
                  <Toggle
                    label={`הפעלת ${u.username}`}
                    value={u.isActive}
                    onChange={async (v) => {
                      try {
                        await api.updatePanelUser(u.id, { isActive: v });
                        team.reload();
                      } catch (e) {
                        toast((e as Error).message, 'error');
                      }
                    }}
                  />
                </Row>
              </View>
            ))}
          </Card>
        </>
      )}

      <Sheet visible={roleSheet} onClose={() => setRoleSheet(false)} title="הוספת איש צוות">
        <Field label="טלפון נייד" keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="050-0000000" />
        <Field label="שם (אם עוד לא נרשם/ה)" value={name} onChangeText={setName} />
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: 'STAFF', label: 'צוות' },
            { value: 'MANAGER', label: 'מנהל/ת' },
            { value: 'OWNER', label: 'בעלים' },
          ]}
        />
        <Text variant="small" color={colors.textSoft}>
          {ROLE_TEXT[role]}
        </Text>
        <Button title="שמירת הרשאה" icon="shield-check-outline" onPress={saveRole} />
      </Sheet>

      <Sheet visible={panelSheet} onClose={() => setPanelSheet(false)} title="משתמש פאנל חדש">
        <Field label="שם מלא" value={name} onChangeText={setName} />
        <Field label="שם משתמש (אנגלית)" autoCapitalize="none" value={username} onChangeText={setUsername} />
        <Field label="סיסמה (8 תווים לפחות)" secureTextEntry value={password} onChangeText={setPassword} />
        <Segmented
          value={role}
          onChange={setRole}
          options={[
            { value: 'STAFF', label: 'צוות' },
            { value: 'MANAGER', label: 'מנהל/ת' },
            { value: 'OWNER', label: 'בעלים' },
          ]}
        />
        <Button title="יצירת משתמש" onPress={createPanelUser} />
      </Sheet>
    </Screen>
  );
}
