import { Tabs } from 'expo-router/tabs';
import { TabBar, type TabMeta } from '../../../components/TabBar';

const META: Record<string, TabMeta> = {
  index: { label: 'לוח בקרה', icon: 'view-dashboard-outline', iconActive: 'view-dashboard' },
  appointments: { label: 'יומן תורים', icon: 'calendar-month-outline', iconActive: 'calendar-month' },
  new: { label: 'תור חדש', icon: 'plus', iconActive: 'plus', center: true },
  customers: { label: 'לקוחות', icon: 'account-group-outline', iconActive: 'account-group' },
  manage: { label: 'ניהול', icon: 'cog-outline', iconActive: 'cog' },
};

export default function AdminTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} meta={META} dark />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="appointments" />
      <Tabs.Screen name="new" />
      <Tabs.Screen name="customers" />
      <Tabs.Screen name="manage" />
    </Tabs>
  );
}
