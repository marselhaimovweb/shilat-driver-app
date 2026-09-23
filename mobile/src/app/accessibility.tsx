import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Toggle } from '../components/Controls';
import { Card, Divider, Hero, IconBadge, Row, Screen, SectionTitle } from '../components/Layout';
import { openLegal } from '../components/Legal';
import { Text } from '../components/Text';
import { useA11y, type TextScale } from '../state/accessibility';
import { useConfig } from '../state/config';
import { colors, fonts, radius, space } from '../theme';

const SIZES: { value: TextScale; label: string }[] = [
  { value: 1, label: 'רגיל' },
  { value: 1.15, label: 'גדול' },
  { value: 1.3, label: 'גדול מאוד' },
];

export default function AccessibilitySettings() {
  const a11y = useA11y();
  const { config } = useConfig();
  const phone = config?.business.accessibilityPhone || config?.business.phone;

  return (
    <Screen header={<Hero back eyebrow="נגישות" title="הגדרות נגישות" subtitle="התאימו את האפליקציה לצרכים שלכם. ההגדרות נשמרות במכשיר." compact />}>
      <SectionTitle title="גודל טקסט" />
      <Row gap={10}>
        {SIZES.map((s) => {
          const on = a11y.textScale === s.value;
          return (
            <Pressable
              key={s.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`גודל טקסט ${s.label}`}
              onPress={() => a11y.update({ textScale: s.value })}
              style={[styles.size, on && styles.sizeOn]}
            >
              <Text style={{ fontSize: 16 * s.value, lineHeight: 22 * s.value }} weight={fonts.bold} color={on ? colors.cobalt : colors.text}>
                אב
              </Text>
              <Text variant="small" color={on ? colors.cobalt : colors.textSoft}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </Row>

      <Card padded={false}>
        <Row style={{ padding: space.md }}>
          <IconBadge icon="contrast-circle" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">ניגודיות גבוהה</Text>
            <Text variant="small" color={colors.textSoft}>
              טקסט משני כהה יותר וקריא יותר
            </Text>
          </View>
          <Toggle label="ניגודיות גבוהה" value={a11y.highContrast} onChange={(v) => a11y.update({ highContrast: v })} />
        </Row>
        <Divider />
        <Row style={{ padding: space.md }}>
          <IconBadge icon="motion-pause-outline" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">עצירת אנימציות</Text>
            <Text variant="small" color={colors.textSoft}>
              ללא תנועה ומעברים מונפשים
            </Text>
          </View>
          <Toggle label="עצירת אנימציות" value={a11y.reduceMotion} onChange={(v) => a11y.update({ reduceMotion: v })} />
        </Row>
      </Card>

      <Card style={{ gap: 10 }}>
        <Row>
          <MaterialCommunityIcons name="information-outline" size={22} color={colors.cobalt} />
          <Text variant="bodyStrong">טיפים</Text>
        </Row>
        <Text color={colors.textSoft}>האפליקציה תומכת בקוראי מסך (VoiceOver ב-iPhone ו-TalkBack באנדרואיד) ובהגדלת הגופן של הטלפון.</Text>
        <Text color={colors.textSoft}>בעת הזמנת תור אפשר לסמן "אני זקוק/ה לסיוע נגישות" והצוות ייערך מראש.</Text>
      </Card>

      <Button title="הצהרת הנגישות המלאה" variant="secondary" icon="file-document-outline" onPress={() => openLegal('ACCESSIBILITY')} />
      {!!phone && <Button title={`פנייה לרכז/ת הנגישות · ${phone}`} variant="ghost" icon="phone-outline" onPress={() => Linking.openURL(`tel:${phone}`)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  size: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.line },
  sizeOn: { borderColor: colors.cobalt, backgroundColor: '#F5F9FF' },
});
