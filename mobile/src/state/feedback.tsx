import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, haptic } from '../components/Button';
import { Text } from '../components/Text';
import { colors, radius, shadows, space } from '../theme';

/*
 * Cross-platform confirm dialog + toast. React Native's Alert does nothing on
 * the web, so the app uses these everywhere instead.
 */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type ToastKind = 'success' | 'error' | 'info';

interface FeedbackContextValue {
  confirm(options: ConfirmOptions): Promise<boolean>;
  toast(message: string, kind?: ToastKind): void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [toastState, setToastState] = useState<{ message: string; kind: ToastKind; id: number } | null>(null);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ ...options, resolve })), []);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    haptic(kind === 'error' ? 'warning' : 'success');
    setToastState({ message, kind, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toastState) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== 'web', friction: 8 }).start();
    AccessibilityInfo.announceForAccessibility?.(toastState.message);
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(() => setToastState(null));
    }, 2600);
    return () => clearTimeout(t);
  }, [toastState, anim]);

  const close = (value: boolean) => {
    dialog?.resolve(value);
    setDialog(null);
  };

  const toastColor = toastState?.kind === 'error' ? colors.danger : toastState?.kind === 'info' ? colors.cobalt : colors.success;

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      <Modal transparent visible={!!dialog} animationType="fade" onRequestClose={() => close(false)}>
        <Pressable style={styles.backdrop} onPress={() => close(false)}>
          <Pressable style={[styles.dialog, shadows.lg]} onPress={() => undefined}>
            <View
              style={[
                styles.dialogIcon,
                { backgroundColor: dialog?.destructive ? colors.dangerSoft : colors.infoSoft },
              ]}
            >
              <MaterialCommunityIcons
                name={dialog?.destructive ? 'alert-circle-outline' : 'help-circle-outline'}
                size={30}
                color={dialog?.destructive ? colors.danger : colors.cobalt}
              />
            </View>
            <Text variant="h2" align="center">
              {dialog?.title}
            </Text>
            {dialog?.message && (
              <Text color={colors.textSoft} align="center">
                {dialog.message}
              </Text>
            )}
            <View style={{ gap: 10, alignSelf: 'stretch', marginTop: 8 }}>
              <Button
                title={dialog?.confirmText ?? 'אישור'}
                variant={dialog?.destructive ? 'danger' : 'primary'}
                onPress={() => close(true)}
                size="md"
              />
              <Button title={dialog?.cancelText ?? 'ביטול'} variant="ghost" onPress={() => close(false)} size="md" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {toastState && (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            shadows.lg,
            { top: insets.top + 10, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] },
          ]}
        >
          <MaterialCommunityIcons
            name={toastState.kind === 'error' ? 'alert-circle' : toastState.kind === 'info' ? 'information' : 'check-circle'}
            size={22}
            color={toastColor}
          />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {toastState.message}
          </Text>
        </Animated.View>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}

/** Bottom sheet built on Modal - used for forms and quick actions. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={[styles.backdrop, { justifyContent: 'flex-end', padding: 0 }]} onPress={onClose}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]} onPress={() => undefined}>
            <View style={styles.grabber} />
            {title && <Text variant="h2">{title}</Text>}
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,18,31,0.55)', justifyContent: 'center', padding: space.xl },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: space.xl, alignItems: 'center', gap: 10, maxWidth: 420, width: '100%', alignSelf: 'center' },
  dialogIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 480,
    alignSelf: 'center',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
    gap: space.md,
    maxHeight: '92%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 4 },
});
