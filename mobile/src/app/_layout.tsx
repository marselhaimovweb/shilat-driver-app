import {
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  Rubik_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/rubik';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccessibilityProvider } from '../state/accessibility';
import { CartProvider } from '../state/cart';
import { ConfigProvider } from '../state/config';
import { FeedbackProvider } from '../state/feedback';
import { SessionProvider, useSession } from '../state/session';
import { colors } from '../theme';

// Hebrew UI: right-to-left everywhere
if (Platform.OS === 'web') {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'he');
  }
} else if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Navigator() {
  const { ready } = useSession();
  const [fontsLoaded] = useFonts({ Rubik_400Regular, Rubik_500Medium, Rubik_600SemiBold, Rubik_700Bold, Rubik_800ExtraBold });

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.ink }} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.mist } }}>
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="login" />
      <Stack.Screen name="admin-login" />
      <Stack.Screen name="payment" options={{ presentation: 'modal' }} />
      <Stack.Screen name="booking-success" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="order-success" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
      <Stack.Screen name="admin" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AccessibilityProvider>
        <SessionProvider>
          <ConfigProvider>
            <CartProvider>
              <FeedbackProvider>
                <StatusBar style="light" />
                <Navigator />
              </FeedbackProvider>
            </CartProvider>
          </ConfigProvider>
        </SessionProvider>
      </AccessibilityProvider>
    </SafeAreaProvider>
  );
}
