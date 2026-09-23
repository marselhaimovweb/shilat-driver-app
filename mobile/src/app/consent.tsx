import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, type LegalDocMeta } from '../api';
import { Button } from '../components/Button';
import { Checkbox } from '../components/Controls';
import { Card, Divider, Hero, IconBadge, Loader, Row, Screen } from '../components/Layout';
import { LegalLink, openLegal } from '../components/Legal';
import { Text } from '../components/Text';
import { useAsync } from '../lib/useAsync';
import { useFeedback } from '../state/feedback';
import { useSession } from '../state/session';
import { colors, fonts } from '../theme';

/**
 * Asks for (renewed) agreement to the terms and privacy policy. Shown after
 * sign-up and whenever the business publishes a new version. Bookings and
 * purchases are blocked by the server until this is done.
 */
export default function Consent() {
  const { signOut } = useSession();
  const { toast } = useFeedback();
  const pending = useAsync(() => api.getPendingConsents(), []);
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);

  const docs: LegalDocMeta[] = pending.data ?? [];
  const isUpdate = docs.some((d) => d.version > 1);

  async function accept() {
    setBusy(true);
    try {
      await api.acceptConsents(docs.map((d) => d.key));
      if (marketing) await api.updateMe({ marketingOptIn: true });
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!pending.loading && docs.length === 0) {
    return (
      <Screen header={<Hero title="הכל מאושר" compact />}>
        <Button title="המשך" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen
      header={
        <Hero
          eyebrow="לפני שממשיכים"
          title={isUpdate ? 'עדכנו את התנאים' : 'רגע של אותיות קטנות'}
          subtitle={isUpdate ? 'פרסמנו גרסה חדשה של המסמכים. כדי להמשיך להזמין יש לאשר אותה.' : 'כדי להזמין תורים ומוצרים יש לאשר את התקנון ואת מדיניות הפרטיות.'}
          compact
        />
      }
      footer={<Button title="אישור והמשך" icon="check-circle-outline" onPress={accept} disabled={!agreed} loading={busy} />}
    >
      {pending.loading ? (
        <Loader />
      ) : (
        <>
          <Card padded={false}>
            {docs.map((d, i) => (
              <View key={d.key}>
                {i > 0 && <Divider />}
                <Row style={{ padding: 16 }}>
                  <IconBadge icon={d.key === 'PRIVACY' ? 'shield-lock-outline' : 'file-document-outline'} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{d.title}</Text>
                    <Text variant="small" color={colors.textSoft}>
                      גרסה {d.version} · עודכן {new Date(d.updatedAt).toLocaleDateString('he-IL')}
                    </Text>
                  </View>
                  <Button title="קריאה" variant="secondary" size="sm" full={false} onPress={() => openLegal(d.key)} />
                </Row>
              </View>
            ))}
          </Card>

          <Card style={{ gap: 16 }}>
            <Checkbox checked={agreed} onChange={setAgreed}>
              <Text>
                קראתי ואני מסכים/ה ל<LegalLink docKey="TERMS">תקנון</LegalLink> ול<LegalLink docKey="PRIVACY">מדיניות הפרטיות</LegalLink>, כולל{' '}
                <LegalLink docKey="CANCELLATION">מדיניות הביטולים וההחזרות</LegalLink>.
              </Text>
            </Checkbox>
            <Divider />
            <Checkbox checked={marketing} onChange={setMarketing}>
              <Text>
                <Text weight={fonts.semibold}>לא חובה: </Text>
                אשמח לקבל הודעות על מבצעים והטבות ב-SMS ובדוא״ל. אפשר להסיר בכל עת מהפרופיל.
              </Text>
            </Checkbox>
          </Card>

          <Button
            title="לא עכשיו - התנתקות"
            variant="ghost"
            size="md"
            onPress={async () => {
              await signOut();
              router.replace('/welcome');
            }}
          />
        </>
      )}
    </Screen>
  );
}
