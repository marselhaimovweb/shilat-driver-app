import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api } from '../api';
import { formatPlate } from '../lib/format';
import { useConfig } from '../state/config';
import { Sheet } from '../state/feedback';
import { colors, radius, shadows, space } from '../theme';
import { Button } from './Button';
import { Field } from './Controls';
import { Plate, vehicleIcon } from './Domain';
import { Row } from './Layout';
import { Text } from './Text';

export function AddVehicleSheet({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: (id: number) => void }) {
  const { config } = useConfig();
  const [plate, setPlate] = useState('');
  const [nickname, setNickname] = useState('');
  const [typeCode, setTypeCode] = useState('PRIVATE');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const digits = plate.replace(/\D/g, '');
    if (digits.length < 5 || digits.length > 8) return setError('מספר רכב צריך להכיל 5-8 ספרות');
    setBusy(true);
    try {
      const res = await api.addVehicle({ plateNumber: digits, vehicleTypeCode: typeCode, nickname: nickname.trim() || undefined });
      setPlate('');
      setNickname('');
      setError(null);
      onAdded(res.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="הוספת רכב">
      <Row gap={10}>
        {config?.vehicleTypes.map((t) => {
          const on = t.code === typeCode;
          return (
            <Pressable key={t.code} onPress={() => setTypeCode(t.code)} style={[styles.type, on && styles.typeOn]}>
              <MaterialCommunityIcons name={vehicleIcon(t.code)} size={30} color={on ? colors.cobalt : colors.textMuted} />
              <Text variant="bodyStrong">{t.nameHe}</Text>
            </Pressable>
          );
        })}
      </Row>
      <Field label="מספר רישוי" icon="card-text-outline" placeholder="12-345-67" keyboardType="number-pad" value={plate} onChangeText={setPlate} error={error} maxLength={10} />
      {plate.replace(/\D/g, '').length >= 5 && (
        <View style={{ alignItems: 'center' }}>
          <Plate number={formatPlate(plate)} scale={1.4} />
        </View>
      )}
      <Field label="כינוי (לא חובה)" icon="tag-heart-outline" placeholder="למשל: הרכב של אמא" value={nickname} onChangeText={setNickname} maxLength={50} />
      <Button title="שמירת הרכב" icon="content-save-outline" onPress={save} loading={busy} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  type: {
    flex: 1,
    gap: 8,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
  },
  typeOn: { borderColor: colors.cobalt, backgroundColor: '#F5F9FF', ...shadows.sm },
});
