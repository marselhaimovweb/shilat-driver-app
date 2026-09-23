import { Redirect, router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { useEffect } from 'react';
import { api, ApiError } from '../../api';
import { TabBar, type TabMeta } from '../../components/TabBar';
import { useCart } from '../../state/cart';
import { useConfig } from '../../state/config';
import { isStaff, useSession } from '../../state/session';

export default function CustomerLayout() {
  const { session, signIn, signOut } = useSession();
  const { config } = useConfig();
  const cart = useCart();

  // keep the role fresh (an owner may have promoted or demoted this user) and
  // ask for consent again when the terms or privacy policy were updated
  useEffect(() => {
    if (session?.role !== 'customer') return;
    let alive = true;
    (async () => {
      try {
        const me = await api.getMe();
        const adminRole = me.role && me.role !== 'CUSTOMER' ? me.role : undefined;
        if (alive && adminRole !== session.adminRole) await signIn({ ...session, adminRole, name: me.fullName ?? session.name });
        const pending = await api.getPendingConsents();
        if (alive && pending.length) router.push('/consent');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await signOut();
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  if (!session) return <Redirect href="/welcome" />;
  if (session.role === 'admin') return <Redirect href="/admin" />;

  const meta: Record<string, TabMeta> = {
    index: { label: 'בית', icon: 'home-variant-outline', iconActive: 'home-variant' },
    appointments: { label: 'התורים שלי', icon: 'calendar-blank-outline', iconActive: 'calendar-check' },
    book: { label: 'הזמנה', icon: 'plus', iconActive: 'plus', center: true },
    ...(config?.features.STORE !== false
      ? { store: { label: 'חנות', icon: 'shopping-outline', iconActive: 'shopping', badge: cart.count } as TabMeta }
      : {}),
    profile: { label: 'פרופיל', icon: 'account-circle-outline', iconActive: 'account-circle' },
    // shown only to the business owner and staff
    ...(isStaff(session) ? { manage: { label: 'ניהול', icon: 'shield-crown-outline', iconActive: 'shield-crown', href: '/admin' } as TabMeta } : {}),
  };

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} meta={meta} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="appointments" />
      <Tabs.Screen name="book" />
      <Tabs.Screen name="store" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="manage" />
      <Tabs.Screen name="prices" />
    </Tabs>
  );
}
