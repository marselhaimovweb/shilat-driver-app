import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, type AdminRole } from '../../../api';
import { Button, type IconName } from '../../../components/Button';
import { Card, Hero, IconBadge, Screen, SectionTitle } from '../../../components/Layout';
import { Text } from '../../../components/Text';
import { useFeedback } from '../../../state/feedback';
import { useSession } from '../../../state/session';
import { colors, radius, shadows, space } from '../../../theme';

type Item = { icon: IconName; title: string; text: string; href: Href; color: string; bg: string; minRole?: AdminRole };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'הפעלה ותמחור',
    items: [
      { icon: 'toggle-switch-outline', title: 'מתגי מערכות', text: 'הפעלה וכיבוי של כל מערכת באפליקציה', href: '/admin/systems', color: colors.cobalt, bg: colors.infoSoft, minRole: 'MANAGER' },
      { icon: 'tag-multiple-outline', title: 'מחירון', text: 'מחירים לפי רכב ושירות', href: '/admin/prices', color: '#0CA678', bg: colors.successSoft, minRole: 'MANAGER' },
      { icon: 'star-plus-outline', title: 'תוספות לשטיפה', text: 'ווקס, פוליש, ניקוי מנוע ועוד', href: '/admin/addons', color: '#B7791F', bg: '#FFF6DD', minRole: 'MANAGER' },
      { icon: 'tune-variant', title: 'חוקים ופרטי העסק', text: 'מקדמה, עמדות, מע״מ, פרטים משפטיים ונגישות', href: '/admin/settings', color: '#7048E8', bg: '#F0EBFF', minRole: 'MANAGER' },
      { icon: 'clock-time-four-outline', title: 'שעות פעילות וחגים', text: 'שעות לפי יום וימים סגורים', href: '/admin/hours', color: colors.warning, bg: colors.warningSoft, minRole: 'MANAGER' },
    ],
  },
  {
    title: 'חנות',
    items: [
      { icon: 'store-outline', title: 'חנות ומלאי', text: 'מוצרים, קטגוריות, מלאי והזמנות', href: '/admin/store', color: '#0B8FB3', bg: colors.foam },
    ],
  },
  {
    title: 'ביצועים ולקוחות',
    items: [
      { icon: 'chart-box-outline', title: 'דוחות', text: 'הכנסות, שירותים, שעות עומס ומקדמות', href: '/admin/reports', color: colors.ocean, bg: colors.foam },
      { icon: 'star-outline', title: 'דירוגים', text: 'מה הלקוחות אומרים עליכם', href: '/admin/reviews', color: '#B7791F', bg: '#FFF6DD' },
    ],
  },
  {
    title: 'אבטחה, סליקה וחוקיות',
    items: [
      { icon: 'account-key-outline', title: 'צוות והרשאות', text: 'מי מנהל, מי עובד ומי לקוח', href: '/admin/team', color: colors.navy, bg: '#E6ECF2', minRole: 'OWNER' },
      { icon: 'credit-card-settings-outline', title: 'סליקת אשראי', text: 'חברת הסליקה, מסוף ופרטי חיבור', href: '/admin/payments', color: colors.cobalt, bg: colors.infoSoft, minRole: 'OWNER' },
      { icon: 'scale-balance', title: 'מסמכים משפטיים', text: 'תקנון, פרטיות, ביטולים והצהרת נגישות', href: '/admin/legal', color: '#495057', bg: '#F1F3F5' },
      { icon: 'clipboard-text-clock-outline', title: 'יומן פעולות', text: 'מי שינה מה ומתי - תיעוד מלא', href: '/admin/audit', color: '#495057', bg: '#F1F3F5', minRole: 'MANAGER' },
    ],
  },
];

const RANK: Record<AdminRole, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };
const ROLE_LABEL: Record<AdminRole, string> = { OWNER: 'בעלים', MANAGER: 'מנהל/ת', STAFF: 'צוות' };

export default function Manage() {
  const { signOut, session } = useSession();
  const { confirm } = useFeedback();
  const role = session?.adminRole ?? 'STAFF';
  const allowed = (i: Item) => !i.minRole || RANK[role] >= RANK[i.minRole];

  return (
    <Screen header={<Hero eyebrow={ROLE_LABEL[role]} title="ניהול העסק" subtitle="כל ההגדרות במקום אחד - מהטלפון ומהמחשב" compact />}>
      {session?.role === 'customer' && (
        <Card onPress={() => router.replace('/')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconBadge icon="cellphone" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">חזרה לאפליקציית הלקוחות</Text>
            <Text variant="small" color={colors.textSoft}>
              הזמנת תורים, חנות והפרופיל שלך
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.textMuted} />
        </Card>
      )}

      {GROUPS.map((g) => {
        const items = g.items.filter(allowed);
        if (!items.length) return null;
        return (
          <View key={g.title} style={{ gap: space.md }}>
            <SectionTitle title={g.title} />
            <View style={styles.grid}>
              {items.map((item) => (
                <Pressable
                  key={item.title}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.text}`}
                  onPress={() => router.push(item.href)}
                  style={({ pressed }) => [styles.tile, shadows.sm, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <IconBadge icon={item.icon} color={item.color} background={item.bg} />
                  <Text variant="h3">{item.title}</Text>
                  <Text variant="small" color={colors.textSoft}>
                    {item.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name={api.mode === 'demo' ? 'flask-outline' : 'database-check-outline'} size={20} color={colors.textSoft} />
          <Text variant="bodyStrong">{api.mode === 'demo' ? 'מצב הדגמה' : 'מחובר לשרת'}</Text>
        </View>
        <Text variant="small" color={colors.textSoft}>
          {api.mode === 'demo'
            ? 'הנתונים הם נתוני דוגמה בזיכרון ומתאפסים בטעינה מחדש. לחיבור לשרת ול-SQL Server הגדירו EXPO_PUBLIC_API_URL.'
            : 'הנתונים נשמרים במסד הנתונים SQL Server של העסק. כל פעולה ניהולית מתועדת ביומן הפעולות.'}
        </Text>
      </Card>

      <Button
        title="התנתקות"
        variant="ghost"
        icon="logout"
        onPress={async () => {
          if (await confirm({ title: 'להתנתק?', confirmText: 'התנתקות' })) {
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
