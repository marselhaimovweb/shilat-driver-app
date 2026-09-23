import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { api, type LegalKey } from '../../../api';
import { Button } from '../../../components/Button';
import { Field, Segmented, Toggle } from '../../../components/Controls';
import { Card, ErrorState, Hero, Loader, Row, Screen } from '../../../components/Layout';
import { LegalText } from '../../../components/Legal';
import { Text } from '../../../components/Text';
import { useAsync } from '../../../lib/useAsync';
import { useFeedback } from '../../../state/feedback';
import { useSession } from '../../../state/session';
import { colors, fonts, radius } from '../../../theme';

const PLACEHOLDERS = '{{BUSINESS_NAME}} {{LEGAL_NAME}} {{TAX_ID}} {{ADDRESS}} {{PHONE}} {{EMAIL}} {{DEPOSIT}} {{CANCEL_HOURS}} {{VAT}} {{DELIVERY_DAYS}} {{PICKUP_DAYS}} {{ACCESS_COORDINATOR}} {{ACCESS_PHONE}} {{ACCESS_PHYSICAL}} {{UPDATED}}';

export default function LegalEditor() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { session } = useSession();
  const { toast, confirm } = useFeedback();
  const doc = useAsync(() => api.getLegalDocRaw(key as LegalKey), [key]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [newVersion, setNewVersion] = useState(true);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [saving, setSaving] = useState(false);
  const canEdit = session?.adminRole === 'OWNER';

  useEffect(() => {
    if (doc.data) {
      setTitle(doc.data.title);
      setContent(doc.data.content);
    }
  }, [doc.data]);

  async function save() {
    if (newVersion && doc.data?.requiresConsent) {
      const ok = await confirm({
        title: 'לפרסם גרסה חדשה?',
        message: 'כל הלקוחות יתבקשו לאשר את המסמך מחדש לפני ההזמנה הבאה.',
        confirmText: 'פרסום',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      doc.setData(await api.saveLegalDoc(key as LegalKey, { title, content, newVersion }));
      toast('המסמך נשמר');
      router.back();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      header={
        <Hero back eyebrow={doc.data ? `גרסה ${doc.data.version}` : ''} title={title || 'מסמך'} compact>
          <Segmented tone="dark" value={mode} onChange={setMode} options={[{ value: 'edit', label: 'עריכה' }, { value: 'preview', label: 'תצוגה מקדימה' }]} />
        </Hero>
      }
      footer={canEdit ? <Button title={newVersion ? 'פרסום גרסה חדשה' : 'שמירת תיקון (אותה גרסה)'} icon="content-save-outline" onPress={save} loading={saving} /> : undefined}
    >
      {doc.loading ? (
        <Loader />
      ) : doc.error ? (
        <ErrorState message={doc.error} onRetry={doc.reload} />
      ) : mode === 'preview' ? (
        <Card>
          <LegalText content={content} />
        </Card>
      ) : (
        <>
          {!canEdit && <Text color={colors.warning}>צפייה בלבד - עריכת מסמכים משפטיים מותרת לבעלים.</Text>}
          <Field label="כותרת" value={title} onChangeText={setTitle} editable={canEdit} />
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, padding: 12 }}>
            <TextInput
              accessibilityLabel="תוכן המסמך"
              value={content}
              onChangeText={setContent}
              editable={canEdit}
              multiline
              style={{
                minHeight: 420,
                fontFamily: fonts.regular,
                fontSize: 15,
                lineHeight: 22,
                color: colors.text,
                textAlignVertical: 'top',
                ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
              }}
            />
          </View>
          <Text variant="small" color={colors.textMuted}>
            # כותרת, ## תת-כותרת, - רשימה. שדות אוטומטיים: {PLACEHOLDERS}
          </Text>
          {canEdit && (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">גרסה חדשה</Text>
                  <Text variant="small" color={colors.textSoft}>
                    לשינוי מהותי. {doc.data?.requiresConsent ? 'הלקוחות יתבקשו לאשר מחדש.' : ''} כבוי = תיקון ניסוח קטן.
                  </Text>
                </View>
                <Toggle label="גרסה חדשה" value={newVersion} onChange={setNewVersion} />
              </Row>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
