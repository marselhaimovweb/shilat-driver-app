import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { api } from '../api';
import { Button } from '../components/Button';
import { Field } from '../components/Controls';
import { Card, Hero, IconBadge, Row, Screen } from '../components/Layout';
import { Text } from '../components/Text';
import { useSession } from '../state/session';
import { colors, radius } from '../theme';

export default function AdminLogin() {
  const { signIn } = useSession();
  const [username, setUsername] = useState(api.mode === 'demo' ? 'admin' : '');
  const [password, setPassword] = useState(api.mode === 'demo' ? 'demo' : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login() {
    setError(null);
    setBusy(true);
    try {
      const res = await api.adminLogin(username.trim(), password);
      await signIn({ token: res.token, role: 'admin', name: res.admin.fullName, adminRole: res.admin.role });
      router.replace('/admin');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<Hero back eyebrow="מערכת ניהול" title="כניסת מנהל" subtitle="לוח הבקרה של העסק - תורים, מחירים, לקוחות ודוחות" compact />}>
        <Card style={{ gap: 16 }}>
          <Row>
            <IconBadge icon="shield-lock-outline" />
            <Text color={colors.textSoft} style={{ flex: 1 }}>
              הכניסה מיועדת לבעלי העסק ולצוות בלבד
            </Text>
          </Row>
          <Field label="שם משתמש" icon="account-tie-outline" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          <Field
            label="סיסמה"
            icon="lock-outline"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            error={error}
            onSubmitEditing={login}
          />
          <Button title="כניסה ללוח הבקרה" icon="login" variant="dark" onPress={login} loading={busy} />
          {api.mode === 'demo' && (
            <View style={{ backgroundColor: colors.warningSoft, borderRadius: radius.sm, padding: 10 }}>
              <Text variant="small" color="#9A6700" align="center">
                מצב הדגמה - כל שם משתמש וסיסמה יתקבלו
              </Text>
            </View>
          )}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
