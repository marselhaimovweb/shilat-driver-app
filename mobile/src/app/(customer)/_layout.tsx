import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { TabBar, type TabMeta } from '../../components/TabBar';
import { useSession } from '../../state/session';

const META: Record<string, TabMeta> = {
  index: { label: 'בית', icon: 'home-variant-outline', iconActive: 'home-variant' },
  appointments: { label: 'התורים שלי', icon: 'calendar-blank-outline', iconActive: 'calendar-check' },
  book: { label: 'הזמנה', icon: 'plus', iconActive: 'plus', center: true },
  prices: { label: 'מחירון', icon: 'tag-outline', iconActive: 'tag' },
  profile: { label: 'פרופיל', icon: 'account-circle-outline', iconActive: 'account-circle' },
};

export default function CustomerLayout() {
  const { session } = useSession();
  if (!session) return <Redirect href="/welcome" />;
  if (session.role === 'admin') return <Redirect href="/admin" />;

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} meta={META} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="appointments" />
      <Tabs.Screen name="book" />
      <Tabs.Screen name="prices" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
