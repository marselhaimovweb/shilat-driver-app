import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../state/session';
import { colors } from '../../theme';

export default function AdminLayout() {
  const { session } = useSession();
  if (!session) return <Redirect href="/welcome" />;
  // panel accounts, and customers who were given a staff role (owner / manager / worker)
  if (!session.adminRole) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mist } }} />;
}
