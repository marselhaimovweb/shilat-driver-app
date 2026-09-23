import { View } from 'react-native';
import { api } from '../../api';
import { Card, Divider, EmptyState, ErrorState, Hero, Loader, Row, Screen } from '../../components/Layout';
import { Text } from '../../components/Text';
import { useAsync } from '../../lib/useAsync';
import { colors, space } from '../../theme';

const ACTION_LABEL: Record<string, string> = {
  PRICES_UPDATED: 'עדכון מחירון',
  SWITCH_ON: 'הפעלת מערכת',
  SWITCH_OFF: 'כיבוי מערכת',
  SETTINGS_UPDATED: 'עדכון הגדרות',
  HOURS_UPDATED: 'עדכון שעות פעילות',
  APPOINTMENT_CREATED: 'תור ידני',
  APPOINTMENT_CANCELLED: 'ביטול תור',
  APPOINTMENT_NO_SHOW: 'סימון אי-הגעה',
  APPOINTMENT_COMPLETED: 'סיום שטיפה וגבייה',
  CUSTOMER_BLOCKED: 'חסימת לקוח',
  CUSTOMER_UNBLOCKED: 'ביטול חסימה',
  ADDON_SAVED: 'עדכון תוספת',
  PAYMENT_SETTINGS_UPDATED: 'שינוי הגדרות סליקה',
  LEGAL_UPDATED: 'עדכון מסמך משפטי',
  ROLE_CHANGED: 'שינוי הרשאות',
  PANEL_USER_CREATED: 'יצירת משתמש פאנל',
  PANEL_USER_UPDATED: 'עדכון משתמש פאנל',
  PASSWORD_CHANGED: 'שינוי סיסמה',
  PRODUCT_CREATED: 'מוצר חדש',
  PRODUCT_UPDATED: 'עדכון מוצר',
  STOCK_ADJUSTED: 'עדכון מלאי',
  ORDER_CANCELLED: 'ביטול הזמנה',
  ORDER_REFUNDED: 'זיכוי הזמנה',
  ORDER_SHIPPED: 'הזמנה נשלחה',
  ORDER_READY: 'הזמנה מוכנה',
  ORDER_COMPLETED: 'הזמנה נמסרה',
  ORDER_PREPARING: 'הזמנה בהכנה',
  ACCOUNT_DELETED: 'מחיקת חשבון לקוח',
};

/** Who changed what and when - evidence in case of a dispute. */
export default function Audit() {
  const log = useAsync(() => api.listAudit(1), []);
  return (
    <Screen refreshing={log.refreshing} onRefresh={log.refresh} header={<Hero back eyebrow="אבטחה" title="יומן פעולות" subtitle="כל פעולה ניהולית נרשמת עם שם, זמן וכתובת IP" compact />}>
      {log.loading ? (
        <Loader />
      ) : log.error ? (
        <ErrorState message={log.error} onRetry={log.reload} />
      ) : !log.data?.length ? (
        <EmptyState icon="clipboard-text-clock-outline" title="אין פעולות עדיין" />
      ) : (
        <Card padded={false}>
          {log.data.map((a, i) => (
            <View key={a.id}>
              {i > 0 && <Divider />}
              <View style={{ padding: space.md, gap: 2 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="bodyStrong">{ACTION_LABEL[a.action] ?? a.action}</Text>
                  <Text variant="caption" color={colors.textMuted}>
                    {new Date(a.createdAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                </Row>
                <Text variant="small" color={colors.textSoft}>
                  {a.actorName ?? a.actorType}
                  {a.entityId ? ` · ${a.entityType ?? ''} ${a.entityId}` : ''}
                  {a.ipAddress ? ` · IP ${a.ipAddress}` : ''}
                </Text>
                {!!a.details && (
                  <Text variant="caption" color={colors.textMuted} numberOfLines={2}>
                    {a.details}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
