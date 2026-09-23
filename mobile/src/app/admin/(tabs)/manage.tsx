import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../../../api';
import { Button, type IconName } from '../../../components/Button';
import { Card, Hero, IconBadge, Screen, SectionTitle } from '../../../components/Layout';
import { Text } from '../../../components/Text';
import { useFeedback } from '../../../state/feedback';
import { useSession } from '../../../state/session';
import { colors, radius, shadows, space } from '../../../theme';

const GROUPS: { title: string; items: { icon: IconName; title: string; text: string; href: Href; color: string; bg: string }[] }[] = [
  {
    title: 'הפעלה ותמחור',
    items: [
      { icon: 'toggle-switch-outline', title: 'מתגי מערכות', text: 'הפעלה וכיבוי של כל מערכת באפליקציה', href: '/admin/systems', color: colors.cobalt, bg: colors.infoSoft },
      { icon: 'tag-multiple-outline', title: 'מחירון', text: 'עדכון מחירים לפי רכב ושירות', href: '/admin/prices', color: '#0CA678', bg: colors.successSoft },
      { icon: 'tune-variant', title: 'חוקי הזמנה ומקדמות', text: 'מקדמה, עמדות, מרווחי זמן וביטולים', href: '/admin/settings', color: '#7048E8', bg: '#F0EBFF' },
      { icon: 'clock-time-four-outline', title: 'שעות פעילות וחגים', text: 'שעות לפי יום וימים סגורים', href: '/admin/hours', color: colors.warning, bg: colors.warningSoft },
    ],
  },
  {
    title: 'ביצועים ולקוחות',
    items: [
      { icon: 'chart-box-outline', title: 'דוחות', text: 'הכנסות, שירותים, שעות עומס ומקדמות', href: '/admin/reports', color: colors.ocean, bg: colors.foam },
      { icon: 'star-outline', title: 'דירוגים', text: 'מה הלקוחות אומרים עליכם', href: '/admin/reviews', color: '#B7791F', bg: '#FFF6DD' },
    ],
  },
];

export default function Manage() {
  const { signOut, session } = useSession();
  const { confirm } = useFeedback();

  return (
    <Screen header={<Hero eyebrow={session?.adminRole === 'OWNER' ? 'בעלים' : 'צוות'} title="ניהול העסק" subtitle="כל ההגדרות במקום אחד" compact />}>
      {GROUPS.map((g) => (
        <View key={g.title} style={{ gap: space.md }}>
          <SectionTitle title={g.title} />
          <View style={styles.grid}>
            {g.items.map((item) => (
              <Pressable key={item.title} onPress={() => router.push(item.href)} style={({ pressed }) => [styles.tile, shadows.sm, pressed && { transform: [{ scale: 0.98 }] }]}>
                <IconBadge icon={item.icon} color={item.color} background={item.bg} />
                <Text variant="h3">{item.title}</Text>
                <Text variant="small" color={colors.textSoft}>
                  {item.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name={api.mode === 'demo' ? 'flask-outline' : 'database-check-outline'} size={20} color={colors.textSoft} />
          <Text variant="bodyStrong">{api.mode === 'demo' ? 'מצב הדגמה' : 'מחובר לשרת'}</Text>
        </View>
        <Text variant="small" color={colors.textSoft}>
          {api.mode === 'demo'
            ? 'הנתונים הם נתוני דוגמה בזיכרון ומתאפסים בטעינה מחדש. לחיבור לשרת ול-SQL Server הגדירו EXPO_PUBLIC_API_URL.'
            : 'הנתונים נשמרים במסד הנתונים SQL Server של העסק.'}
        </Text>
      </Card>

      <Button
        title="התנתקות"
        variant="ghost"
        icon="logout"
        onPress={async () => {
          if (await confirm({ title: 'להתנתק מלוח הבקרה?', confirmText: 'התנתקות' })) {
            await signOut();
            router.replace('/welcome');
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { width: '48%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 8, minHeight: 150 },
});
