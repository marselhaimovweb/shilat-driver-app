import { Redirect } from 'expo-router';

/** The "ניהול" tab (staff only) opens the management panel. */
export default function ManageTab() {
  return <Redirect href="/admin" />;
}
