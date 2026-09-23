import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../state/session';
import { colors } from '../../theme';

export default function AdminLayout() {
  const { session } = useSession();
  if (!session) return <Redirect href="/welcome" />;
  if (session.role !== 'admin') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mist } }} />;
}
