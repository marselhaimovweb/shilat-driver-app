import { query, queryOne, sql, transaction } from '../db';
import { badRequest, conflict, HttpError, notFound } from '../http';
import { assertConsents } from './legal';
import { activeProvider, refundPayment } from './payments';
import { getFeatures, getSettings } from './settings';
import { sendSms } from './sms';
import { diffDays, nowLocal } from './time';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PREPARING'
  | 'READY'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'REFUNDED';

export const PRODUCT_SELECT = `
  p.ProductId AS id, p.CategoryId AS categoryId, pc.NameHe AS categoryName, p.Sku AS sku, p.NameHe AS nameHe,
  p.DescriptionHe AS descriptionHe, p.UsageWarnings AS usageWarnings, p.Price AS price, p.CompareAtPrice AS compareAtPrice,
  p.Stock AS stock, p.LowStockThreshold AS lowStockThreshold, p.ImageUrl AS imageUrl, p.HasImage AS hasImage,
  p.IsReturnable AS isReturnable, p.IsActive AS isActive, p.SortOrder AS sortOrder, p.UpdatedAt AS updatedAt`;
export const PRODUCT_FROM = 'dbo.Products p LEFT JOIN dbo.ProductCategories pc ON pc.CategoryId = p.CategoryId';

const num = <T extends Record<string, unknown>>(row: T, keys: string[]) => {
  for (const k of keys) if (row[k] !== null && row[k] !== undefined) (row as Record<string, unknown>)[k] = Number(row[k]);
  return row;
};

export async function listCatalog(includeInactive = false) {
  const [categories, products] = await Promise.all([
    query(
      `SELECT CategoryId AS id, NameHe AS nameHe, IconName AS iconName, SortOrder AS sortOrder, IsActive AS isActive
       FROM dbo.ProductCategories WHERE @all = 1 OR IsActive = 1 ORDER BY SortOrder, CategoryId`,
      { all: includeInactive },
    ),
    query<Record<string, unknown>>(
      `SELECT ${PRODUCT_SELECT} FROM ${PRODUCT_FROM}
       WHERE @all = 1 OR (p.IsActive = 1 AND (pc.CategoryId IS NULL OR pc.IsActive = 1))
       ORDER BY p.SortOrder, p.ProductId`,
      { all: includeInactive },
    ),
  ]);
  return { categories, products: products.map((p) => num(p, ['price', 'compareAtPrice'])) };
}

export const ORDER_SELECT = `
  o.OrderId AS id, o.CustomerId AS customerId, c.FullName AS customerName, c.Phone AS customerPhone, o.Status AS status,
  o.Fulfillment AS fulfillment, o.Subtotal AS subtotal, o.DeliveryFee AS deliveryFee, o.Total AS total, o.VatRate AS vatRate,
  o.RefundAmount AS refundAmount, o.ShipName AS shipName, o.ShipPhone AS shipPhone, o.ShipAddress AS shipAddress,
  o.ShipCity AS shipCity, o.CustomerNotes AS customerNotes, o.AdminNotes AS adminNotes, o.CancelReason AS cancelReason,
  o.CreatedAt AS createdAt, o.PaidAt AS paidAt, o.DeliveredAt AS deliveredAt,
  (SELECT SUM(Quantity) FROM dbo.OrderItems WHERE OrderId = o.OrderId) AS itemCount`;
export const ORDER_FROM = 'dbo.Orders o JOIN dbo.Customers c ON c.CustomerId = o.CustomerId';

export async function getOrder(id: number, runner?: sql.Transaction) {
  const order = await queryOne<Record<string, unknown> & { id: number; customerId: number; status: OrderStatus; total: number; deliveredAt: Date | null; paidAt: Date | null; customerPhone: string }>(
    `SELECT ${ORDER_SELECT} FROM ${ORDER_FROM} WHERE o.OrderId = @id`,
    { id },
    runner,
  );
  if (!order) return undefined;
  const items = await query<Record<string, unknown>>(
    `SELECT i.ProductId AS productId, i.NameHe AS nameHe, i.UnitPrice AS unitPrice, i.Quantity AS quantity,
            i.LineTotal AS lineTotal, i.IsReturnable AS isReturnable, p.HasImage AS hasImage, p.ImageUrl AS imageUrl
     FROM dbo.OrderItems i JOIN dbo.Products p ON p.ProductId = i.ProductId WHERE i.OrderId = @id`,
    { id },
    runner,
  );
  return {
    ...num(order, ['subtotal', 'deliveryFee', 'total', 'vatRate', 'refundAmount']),
    items: items.map((i) => num(i, ['unitPrice', 'lineTotal'])),
  };
}

async function logOrder(tx: sql.Transaction, productId: number, delta: number, reason: string, orderId: number | null, by: string, note?: string) {
  await query(
    `UPDATE dbo.Products SET Stock = Stock + @delta, UpdatedAt = GETDATE() WHERE ProductId = @productId;
     INSERT INTO dbo.StockMovements (ProductId, Delta, Reason, OrderId, Note, CreatedBy) VALUES (@productId, @delta, @reason, @orderId, @note, @by)`,
    { productId, delta, reason, orderId, note: note ?? null, by },
    tx,
  );
}

async function restock(tx: sql.Transaction, orderId: number, by: string, reason: 'CANCEL' | 'RETURN') {
  const items = await query<{ ProductId: number; Quantity: number }>('SELECT ProductId, Quantity FROM dbo.OrderItems WHERE OrderId = @orderId', { orderId }, tx);
  for (const i of items) await logOrder(tx, i.ProductId, i.Quantity, reason, orderId, by);
}

export interface OrderInput {
  items: { productId: number; quantity: number }[];
  fulfillment: 'PICKUP' | 'DELIVERY';
  shipName?: string;
  shipPhone?: string;
  shipAddress?: string;
  shipCity?: string;
  notes?: string;
}

export async function createOrder(customerId: number, input: OrderInput) {
  await expirePendingOrders();
  const features = await getFeatures();
  if (!features.STORE) throw new HttpError(503, 'החנות סגורה כרגע', 'STORE_DISABLED');
  if (input.fulfillment === 'DELIVERY' && !features.STORE_DELIVERY) throw badRequest('משלוחים אינם זמינים כרגע - ניתן לבחור איסוף עצמי');
  if (input.fulfillment === 'DELIVERY' && (!input.shipAddress || !input.shipCity || !input.shipName || !input.shipPhone)) {
    throw badRequest('יש למלא שם, טלפון וכתובת למשלוח');
  }
  if (!input.items.length) throw badRequest('העגלה ריקה');
  const termsVersion = await assertConsents(customerId);
  const settings = await getSettings();
  const customer = await queryOne<{ Phone: string; FullName: string | null; IsBlocked: boolean }>(
    'SELECT Phone, FullName, IsBlocked FROM dbo.Customers WHERE CustomerId = @id',
    { id: customerId },
  );
  if (!customer || customer.IsBlocked) throw new HttpError(403, 'לא ניתן לבצע הזמנה. צרו קשר עם העסק');

  const created = await transaction(async (tx) => {
    let subtotal = 0;
    const lines: { productId: number; name: string; price: number; qty: number; returnable: boolean }[] = [];
    for (const item of input.items) {
      const p = await queryOne<{ NameHe: string; Price: number; Stock: number; IsActive: boolean; IsReturnable: boolean }>(
        'SELECT NameHe, Price, Stock, IsActive, IsReturnable FROM dbo.Products WITH (UPDLOCK, ROWLOCK) WHERE ProductId = @id',
        { id: item.productId },
        tx,
      );
      if (!p || !p.IsActive) throw badRequest('אחד המוצרים בעגלה אינו זמין עוד');
      if (p.Stock < item.quantity) throw conflict(`נותרו רק ${Math.max(0, p.Stock)} יחידות של "${p.NameHe}"`, 'OUT_OF_STOCK');
      const price = Number(p.Price);
      subtotal += price * item.quantity;
      lines.push({ productId: item.productId, name: p.NameHe, price, qty: item.quantity, returnable: !!p.IsReturnable });
    }
    const deliveryFee = input.fulfillment === 'DELIVERY' && subtotal < settings.storeFreeDeliveryFrom ? settings.storeDeliveryFee : 0;
    const total = Math.round((subtotal + deliveryFee) * 100) / 100;

    const row = await queryOne<{ id: number }>(
      `INSERT INTO dbo.Orders (CustomerId, Status, Fulfillment, Subtotal, DeliveryFee, Total, VatRate, ShipName, ShipPhone, ShipAddress, ShipCity, CustomerNotes, TermsVersion)
       VALUES (@customerId, 'PENDING_PAYMENT', @fulfillment, @subtotal, @deliveryFee, @total, @vat, @shipName, @shipPhone, @shipAddress, @shipCity, @notes, @termsVersion);
       SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;`,
      {
        customerId,
        fulfillment: input.fulfillment,
        subtotal,
        deliveryFee,
        total,
        vat: settings.vatRate,
        shipName: input.shipName ?? customer.FullName,
        shipPhone: input.shipPhone ?? customer.Phone,
        shipAddress: input.fulfillment === 'DELIVERY' ? input.shipAddress! : null,
        shipCity: input.fulfillment === 'DELIVERY' ? input.shipCity! : null,
        notes: input.notes ?? null,
        termsVersion,
      },
      tx,
    );
    const orderId = row!.id;
    for (const l of lines) {
      await query(
        `INSERT INTO dbo.OrderItems (OrderId, ProductId, NameHe, UnitPrice, Quantity, LineTotal, IsReturnable)
         VALUES (@orderId, @productId, @name, @price, @qty, @line, @returnable)`,
        { orderId, productId: l.productId, name: l.name, price: l.price, qty: l.qty, line: l.price * l.qty, returnable: l.returnable },
        tx,
      );
      // stock is reserved now and released if the payment never arrives
      await logOrder(tx, l.productId, -l.qty, 'SALE', orderId, 'CUSTOMER');
    }

    const provider = await activeProvider();
    const payment = await queryOne<{ id: number }>(
      `INSERT INTO dbo.Payments (OrderId, Kind, Amount, Provider, Status) VALUES (@orderId, 'ORDER', @total, @provider, 'PENDING');
       SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;`,
      { orderId, total, provider: provider.name },
      tx,
    );
    const checkout = await provider.impl.createCheckout(provider.cfg, {
      paymentId: payment!.id,
      amount: total,
      description: `הזמנה #${orderId}`,
      customerName: customer.FullName,
      customerPhone: customer.Phone,
    });
    await query('UPDATE dbo.Payments SET ProviderRef = @ref WHERE PaymentId = @pid', { ref: checkout.providerRef, pid: payment!.id }, tx);
    return { orderId, payment: { id: payment!.id, amount: total, provider: checkout.provider, checkoutUrl: checkout.checkoutUrl } };
  }, sql.ISOLATION_LEVEL.SERIALIZABLE);

  return { order: await getOrder(created.orderId), payment: created.payment, holdMinutes: settings.paymentHoldMinutes };
}

/** Releases stock of orders that were never paid. */
export async function expirePendingOrders() {
  const { paymentHoldMinutes } = await getSettings();
  const stale = await query<{ OrderId: number }>(
    `SELECT OrderId FROM dbo.Orders WHERE Status = 'PENDING_PAYMENT' AND CreatedAt < DATEADD(minute, -@hold, GETDATE())`,
    { hold: paymentHoldMinutes },
  );
  for (const o of stale) {
    await transaction(async (tx) => {
      await query(
        `UPDATE dbo.Orders SET Status = 'CANCELLED', CancelReason = N'לא בוצע תשלום', UpdatedAt = GETDATE() WHERE OrderId = @id AND Status = 'PENDING_PAYMENT';
         UPDATE dbo.Payments SET Status = 'CANCELLED' WHERE OrderId = @id AND Status = 'PENDING';`,
        { id: o.OrderId },
        tx,
      );
      await restock(tx, o.OrderId, 'SYSTEM', 'CANCEL');
    });
  }
}

export async function markOrderPaid(paymentId: number, providerRef?: string) {
  const payment = await queryOne<{ OrderId: number; Status: string }>('SELECT OrderId, Status FROM dbo.Payments WHERE PaymentId = @paymentId', { paymentId });
  if (!payment?.OrderId) throw notFound('תשלום לא נמצא');
  const order = await getOrder(payment.OrderId);
  if (!order) throw notFound();
  if (payment.Status === 'SUCCEEDED') return order;
  if (order.status !== 'PENDING_PAYMENT') throw conflict('זמן ההמתנה לתשלום הסתיים, יש לבצע את ההזמנה מחדש', 'PAYMENT_EXPIRED');
  await transaction(async (tx) => {
    await query(
      `UPDATE dbo.Payments SET Status = 'SUCCEEDED', CompletedAt = GETDATE(), ProviderRef = ISNULL(@ref, ProviderRef) WHERE PaymentId = @paymentId;
       UPDATE dbo.Orders SET Status = 'PAID', PaidAt = GETDATE(), UpdatedAt = GETDATE() WHERE OrderId = @orderId;`,
      { paymentId, ref: providerRef ?? null, orderId: order.id },
      tx,
    );
  });
  const updated = (await getOrder(order.id))!;
  if ((await getFeatures()).SMS_NOTIFICATIONS) {
    const { businessName } = await getSettings();
    await sendSms(order.customerPhone, `${businessName}: הזמנה #${order.id} התקבלה, סה"כ ${order.total} ₪. פרטי ההזמנה ומדיניות הביטול באפליקציה.`).catch(() => undefined);
  }
  return updated;
}

async function refundOrder(tx: sql.Transaction, orderId: number, amount: number) {
  if (amount <= 0) return;
  const paid = await queryOne<{ ProviderRef: string; Provider: string }>(
    `SELECT TOP 1 ProviderRef, Provider FROM dbo.Payments WHERE OrderId = @orderId AND Kind = 'ORDER' AND Status = 'SUCCEEDED' ORDER BY PaymentId DESC`,
    { orderId },
    tx,
  );
  if (!paid) return;
  if (!(await refundPayment(paid.Provider, paid.ProviderRef, amount))) throw new HttpError(502, 'ההחזר נכשל מול חברת הסליקה');
  await query(
    `INSERT INTO dbo.Payments (OrderId, Kind, Amount, Provider, ProviderRef, Status, CompletedAt) VALUES (@orderId, 'REFUND', @amount, @provider, @ref, 'SUCCEEDED', GETDATE());
     UPDATE dbo.Orders SET RefundAmount = RefundAmount + @refund WHERE OrderId = @orderId;`,
    { orderId, amount: -amount, refund: amount, provider: paid.Provider, ref: paid.ProviderRef },
    tx,
  );
}

const BEFORE_HANDOVER: OrderStatus[] = ['PAID', 'PREPARING', 'READY'];

/** Customer cancellation (Consumer Protection Law - distance selling). */
export async function cancelOrderByCustomer(customerId: number, orderId: number, reason?: string) {
  const order = await getOrder(orderId);
  if (!order || order.customerId !== customerId) throw notFound('ההזמנה לא נמצאה');
  if (order.status === 'PENDING_PAYMENT' || BEFORE_HANDOVER.includes(order.status)) {
    await transaction(async (tx) => {
      if (order.status !== 'PENDING_PAYMENT') await refundOrder(tx, orderId, order.total);
      await query(
        `UPDATE dbo.Orders SET Status = 'CANCELLED', CancelReason = @reason, UpdatedAt = GETDATE() WHERE OrderId = @orderId;
         UPDATE dbo.Payments SET Status = 'CANCELLED' WHERE OrderId = @orderId AND Status = 'PENDING';`,
        { orderId, reason: reason || 'בוטל ע״י הלקוח' },
        tx,
      );
      await restock(tx, orderId, 'CUSTOMER', 'CANCEL');
    });
    return { order: await getOrder(orderId), refunded: order.status !== 'PENDING_PAYMENT', returnRequested: false };
  }
  if (order.status === 'SHIPPED' || order.status === 'COMPLETED') {
    const from = order.deliveredAt ?? order.paidAt;
    if (from && diffDays(nowLocal(new Date(from)).date, nowLocal().date) > 14) {
      throw badRequest('חלפו 14 ימים ממועד קבלת המוצר. לפנייה מיוחדת (אזרח ותיק, אדם עם מוגבלות, עולה חדש) צרו קשר עם העסק');
    }
    await query(
      `UPDATE dbo.Orders SET Status = 'RETURN_REQUESTED', CancelReason = @reason, UpdatedAt = GETDATE() WHERE OrderId = @orderId`,
      { orderId, reason: reason || 'בקשת החזרה' },
    );
    return { order: await getOrder(orderId), refunded: false, returnRequested: true };
  }
  throw badRequest('לא ניתן לבטל הזמנה זו');
}

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['CANCELLED'],
  PAID: ['PREPARING', 'READY', 'SHIPPED', 'CANCELLED'],
  PREPARING: ['READY', 'SHIPPED', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  SHIPPED: ['COMPLETED', 'RETURN_REQUESTED'],
  COMPLETED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['REFUNDED', 'COMPLETED'],
  CANCELLED: [],
  REFUNDED: [],
};

export async function adminSetOrderStatus(
  orderId: number,
  status: OrderStatus,
  opts: { by: string; reason?: string; refundAmount?: number; restock?: boolean },
) {
  const order = await getOrder(orderId);
  if (!order) throw notFound();
  if (!ORDER_TRANSITIONS[order.status].includes(status)) throw badRequest('מעבר סטטוס לא חוקי');
  await transaction(async (tx) => {
    if (status === 'CANCELLED') {
      if (order.status !== 'PENDING_PAYMENT') await refundOrder(tx, orderId, order.total);
      await restock(tx, orderId, opts.by, 'CANCEL');
    }
    if (status === 'REFUNDED') {
      const amount = Math.min(order.total, opts.refundAmount ?? order.total);
      await refundOrder(tx, orderId, amount);
      if (opts.restock) await restock(tx, orderId, opts.by, 'RETURN');
    }
    await query(
      `UPDATE dbo.Orders SET Status = @status, UpdatedAt = GETDATE(),
         CancelReason = CASE WHEN @reason IS NULL THEN CancelReason ELSE @reason END,
         DeliveredAt = CASE WHEN @status = 'COMPLETED' AND DeliveredAt IS NULL THEN GETDATE() ELSE DeliveredAt END
       WHERE OrderId = @orderId;
       UPDATE dbo.Payments SET Status = 'CANCELLED' WHERE OrderId = @orderId AND Status = 'PENDING';`,
      { orderId, status, reason: opts.reason ?? null },
      tx,
    );
  });
  const updated = (await getOrder(orderId))!;
  if ((await getFeatures()).SMS_NOTIFICATIONS && ['READY', 'SHIPPED', 'REFUNDED'].includes(status)) {
    const { businessName } = await getSettings();
    const text = { READY: 'מוכנה לאיסוף בעסק', SHIPPED: 'נשלחה אליך', REFUNDED: 'זוכתה' }[status as 'READY' | 'SHIPPED' | 'REFUNDED'];
    await sendSms(order.customerPhone, `${businessName}: הזמנה #${orderId} ${text}.`).catch(() => undefined);
  }
  return updated;
}

export async function adjustStock(productId: number, delta: number, reason: 'RESTOCK' | 'ADJUST', by: string, note?: string) {
  if (!Number.isInteger(delta) || delta === 0) throw badRequest('כמות לא תקינה');
  await transaction(async (tx) => {
    const p = await queryOne<{ Stock: number }>('SELECT Stock FROM dbo.Products WITH (UPDLOCK) WHERE ProductId = @id', { id: productId }, tx);
    if (!p) throw notFound('מוצר לא נמצא');
    if (p.Stock + delta < 0) throw badRequest('המלאי לא יכול להיות שלילי');
    await logOrder(tx, productId, delta, reason, null, by, note);
  });
}
