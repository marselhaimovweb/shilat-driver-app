import { queryOne } from '../db';
import { badRequest, notFound } from '../http';
import { markDepositPaid } from './bookings';
import { markOrderPaid } from './store';

/**
 * Completes a payment (webhook from the clearing company, or demo confirm) and
 * confirms whatever it belongs to: an appointment deposit or a store order.
 */
export async function completePayment(paymentId: number, providerRef?: string, paidAmount?: number) {
  const payment = await queryOne<{ AppointmentId: number | null; OrderId: number | null; Amount: number }>(
    'SELECT AppointmentId, OrderId, Amount FROM dbo.Payments WHERE PaymentId = @paymentId',
    { paymentId },
  );
  if (!payment) throw notFound('תשלום לא נמצא');
  if (paidAmount !== undefined && Math.abs(Number(payment.Amount) - paidAmount) > 0.01) {
    throw badRequest('סכום התשלום אינו תואם');
  }
  if (payment.AppointmentId) {
    const appointment = await markDepositPaid(paymentId, providerRef);
    return { type: 'APPOINTMENT' as const, id: appointment.id };
  }
  const order = await markOrderPaid(paymentId, providerRef);
  return { type: 'ORDER' as const, id: order.id };
}

export async function paymentStatus(paymentId: number) {
  return queryOne<{ id: number; status: string; appointmentId: number | null; orderId: number | null; customerId: number | null; amount: number }>(
    `SELECT p.PaymentId AS id, p.Status AS status, p.AppointmentId AS appointmentId, p.OrderId AS orderId, p.Amount AS amount,
            ISNULL(a.CustomerId, o.CustomerId) AS customerId
     FROM dbo.Payments p
     LEFT JOIN dbo.Appointments a ON a.AppointmentId = p.AppointmentId
     LEFT JOIN dbo.Orders o ON o.OrderId = p.OrderId
     WHERE p.PaymentId = @paymentId`,
    { paymentId },
  );
}
