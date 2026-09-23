import { useLocalSearchParams } from 'expo-router';
import { api, type LegalKey } from '../../api';
import { Card, ErrorState, Hero, Loader, Screen } from '../../components/Layout';
import { LegalText } from '../../components/Legal';
import { Text } from '../../components/Text';
import { useAsync } from '../../lib/useAsync';
import { colors } from '../../theme';

export default function LegalDocument() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const doc = useAsync(() => api.getLegalDoc(String(key).toUpperCase() as LegalKey), [key]);

  return (
    <Screen header={<Hero back eyebrow="מסמכים משפטיים" title={doc.data?.title ?? ''} compact />}>
      {doc.loading ? (
        <Loader />
      ) : doc.error || !doc.data ? (
        <ErrorState message={doc.error ?? 'המסמך לא נמצא'} onRetry={doc.reload} />
      ) : (
        <>
          <Card>
            {/* the first heading repeats the title - skip it */}
            <LegalText content={doc.data.content.replace(/^# .*\n/, '')} />
          </Card>
          <Text variant="caption" color={colors.textMuted} align="center">
            גרסה {doc.data.version}
          </Text>
        </>
      )}
    </Screen>
  );
}
