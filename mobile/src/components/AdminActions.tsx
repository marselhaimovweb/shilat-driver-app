import { useState } from 'react';
import { View } from 'react-native';
import { api, type Appointment, type PaymentMethod } from '../api';
import { formatPrice, PAYMENT_LABEL } from '../lib/format';
import { Sheet, useFeedback } from '../state/feedback';
import { colors } from '../theme';
import { Button } from './Button';
import { Chip, Field, Toggle } from './Controls';
import { Divider, InfoLine, Row } from './Layout';
import { Text } from './Text';

/** One-tap status actions for an appointment. `compact` (list rows) leaves cancelling to the details screen. */
export function QuickActions({ appointment: a, onChanged, compact }: { appointment: Appointment; onChanged: () => void; compact?: boolean }) {
  const { confirm, toast } = useFeedback();
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function set(status: 'IN_PROGRESS' | 'NO_SHOW' | 'CONFIRMED') {
    if (status === 'NO_SHOW') {
      const ok = await confirm({
        title: 'לסמן שהלקוח לא הגיע?',
        message: a.depositStatus === 'PAID' ? `המקדמה (${formatPrice(a.depositAmount)}) תחולט לטובת העסק.` : undefined,
        confirmText: 'סימון "לא הגיע"',
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      await api.setAppointmentStatus(a.id, { status });
      toast(status === 'IN_PROGRESS' ? 'השטיפה התחילה' : status === 'NO_SHOW' ? 'סומן כלא הגיע' : 'עודכן');
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const actions: React.ReactNode[] = [];
  if (a.status === 'CONFIRMED') {
    actions.push(<Button key="start" title="התחלת שטיפה" icon="water" size="sm" full={false} onPress={() => set('IN_PROGRESS')} />);
    actions.push(<Button key="done" title="סיום" icon="check" size="sm" variant="success" full={false} onPress={() => setCompleting(true)} />);
    actions.push(<Button key="noshow" title="לא הגיע" size="sm" variant="ghost" full={false} onPress={() => set('NO_SHOW')} />);
  } else if (a.status === 'IN_PROGRESS') {
    actions.push(<Button key="done" title="סיום ותשלום" icon="check" size="sm" variant="success" full={false} onPress={() => setCompleting(true)} />);
  } else if (a.status === 'NO_SHOW') {
    actions.push(<Button key="late" title="הגיע באיחור - סיום" size="sm" variant="secondary" full={false} onPress={() => setCompleting(true)} />);
  }
  if (!compact && (a.status === 'CONFIRMED' || a.status === 'PENDING_PAYMENT')) {
    actions.push(<Button key="cancel" title="ביטול" size="sm" variant="ghost" full={false} onPress={() => setCancelling(true)} />);
  }
  if (!actions.length) return null;

  return (
    <>
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {actions}
      </Row>
      <CompleteSheet appointment={completing ? a : null} onClose={() => setCompleting(false)} onDone={() => { setCompleting(false); onChanged(); }} />
      <CancelSheet appointment={cancelling ? a : null} onClose={() => setCancelling(false)} onDone={() => { setCancelling(false); onChanged(); }} />
    </>
  );
}

function CompleteSheet({ appointment: a, onClose, onDone }: { appointment: Appointment | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [discount, setDiscount] = useState('');
  const [busy, setBusy] = useState(false);
  if (!a) return null;
  const extra = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, a.price - a.discountAmount - extra);
  const deposit = a.depositStatus === 'PAID' || a.depositStatus === 'FORFEITED' ? a.depositAmount : 0;
  const due = Math.max(0, total - deposit);

  async function submit() {
    setBusy(true);
    try {
      await api.setAppointmentStatus(a!.id, { status: 'COMPLETED', paymentMethod: method, discount: a!.discountAmount + extra });
      toast(`השטיפה הושלמה · נגבה ${formatPrice(due)}`);
      setDiscount('');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible onClose={onClose} title="סיום שטיפה וגבייה">
      <View style={{ gap: 4 }}>
        <InfoLine label={`${a.serviceName} · ${a.vehicleTypeName}`} value={formatPrice(a.price)} />
        {a.discountAmount > 0 && <InfoLine label="הנחת מועדון" value={`-${formatPrice(a.discountAmount)}`} />}
        {extra > 0 && <InfoLine label="הנחה נוספת" value={`-${formatPrice(extra)}`} />}
        {deposit > 0 && <InfoLine label="מקדמה ששולמה" value={`-${formatPrice(deposit)}`} />}
        <Divider style={{ marginVertical: 6 }} />
        <InfoLine label="לגבייה עכשיו" value={formatPrice(due)} strong />
      </View>
      <Text variant="small" color={colors.textSoft}>
        אמצעי תשלום
      </Text>
      <Row gap={8}>
        {(['CASH', 'CARD', 'BIT'] as PaymentMethod[]).map((m) => (
          <Chip key={m} label={PAYMENT_LABEL[m]} selected={method === m} onPress={() => setMethod(m)} icon={m === 'CASH' ? 'cash' : m === 'CARD' ? 'credit-card-outline' : 'cellphone'} />
        ))}
      </Row>
      <Field label="הנחה נוספת (₪)" keyboardType="numeric" value={discount} onChangeText={(t) => setDiscount(t.replace(/[^\d.]/g, ''))} placeholder="0" />
      <Button title={`אישור · ${formatPrice(due)}`} variant="success" icon="check-circle-outline" onPress={submit} loading={busy} />
    </Sheet>
  );
}

function CancelSheet({ appointment: a, onClose, onDone }: { appointment: Appointment | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!a) return null;

  async function submit() {
    setBusy(true);
    try {
      await api.setAppointmentStatus(a!.id, { status: 'CANCELLED', reason: reason.trim() || undefined, refundDeposit: refund });
      toast('התור בוטל');
      setReason('');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible onClose={onClose} title={`ביטול תור #${a.id}`}>
      <Field label="סיבת הביטול" placeholder="למשל: תקלה במכונה / בקשת הלקוח" value={reason} onChangeText={setReason} />
      {a.depositStatus === 'PAID' && (
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">החזר מקדמה ללקוח</Text>
            <Text variant="small" color={colors.textSoft}>
              {formatPrice(a.depositAmount)} יוחזרו לאמצעי התשלום
            </Text>
          </View>
          <Toggle value={refund} onChange={setRefund} />
        </Row>
      )}
      <Button title="ביטול התור" variant="danger" icon="close-circle-outline" onPress={submit} loading={busy} />
    </Sheet>
  );
}
