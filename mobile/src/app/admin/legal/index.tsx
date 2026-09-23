import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '../../../api';
import { Card, Divider, ErrorState, Hero, IconBadge, Loader, Row, Screen } from '../../../components/Layout';
import { Text } from '../../../components/Text';
import { useAsync } from '../../../lib/useAsync';
import { colors, radius, space } from '../../../theme';

export default function LegalAdmin() {
  const docs = useAsync(() => api.listLegalDocs(), []);
  useFocusEffect(
    useCallback(() => {
      docs.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <Screen header={<Hero back eyebrow="חוקיות" title="מסמכים משפטיים" subtitle="המסמכים מוצגים ללקוחות באפליקציה. פרטי העסק ממולאים אוטומטית מההגדרות." compact />}>
      <Row style={{ backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 14, alignItems: 'flex-start' }}>
        <MaterialCommunityIcons name="scale-balance" size={22} color={colors.warning} />
        <Text variant="small" color={colors.text} style={{ flex: 1 }}>
          המסמכים נכתבו לפי חוק הגנת הצרכן, חוק הגנת הפרטיות וחוק שוויון זכויות לאנשים עם מוגבלות. הם אינם ייעוץ משפטי - מומלץ שעורך/ת דין יעבור/תעבור עליהם לפני העלייה לאוויר.
        </Text>
      </Row>
      {docs.loading ? (
        <Loader />
      ) : docs.error ? (
        <ErrorState message={docs.error} onRetry={docs.reload} />
      ) : (
        <Card padded={false}>
          {docs.data?.map((d, i) => (
            <View key={d.key}>
              {i > 0 && <Divider />}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`עריכת ${d.title}`}
                onPress={() => router.push({ pathname: '/admin/legal/[key]', params: { key: d.key } })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md }}
              >
                <IconBadge icon={d.key === 'ACCESSIBILITY' ? 'wheelchair-accessibility' : d.key === 'PRIVACY' ? 'shield-lock-outline' : 'file-document-outline'} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{d.title}</Text>
                  <Text variant="small" color={colors.textSoft}>
                    גרסה {d.version} · עודכן {new Date(d.updatedAt).toLocaleDateString('he-IL')}
                    {d.requiresConsent ? ' · דורש הסכמת לקוח' : ''}
                  </Text>
                </View>
                <MaterialCommunityIcons name="pencil-outline" size={22} color={colors.cobalt} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
