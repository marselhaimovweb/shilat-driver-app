import { Router } from 'express';
import { completePayment } from '../services/paymentFlow';
import { verifyWebhook } from '../services/payments';

/** Callbacks from the clearing company (server-to-server) and the page the customer returns to. */
export const paymentsRouter = Router();

paymentsRouter.post('/webhook/:provider', async (req, res) => {
  try {
    const result = await verifyWebhook(String(req.params.provider), { ...req.query, ...(req.body ?? {}) });
    if (result.succeeded && result.paymentId) await completePayment(result.paymentId, result.providerRef, result.amount);
    else console.warn('[payments] not successful', req.params.provider, result);
  } catch (err) {
    console.error('[payments] webhook error', err);
  }
  // always 200 so the provider does not retry forever; failures are in the log
  res.status(200).send('OK');
});

paymentsRouter.get('/return', (req, res) => {
  const ok = req.query.status === 'success';
  const pid = encodeURIComponent(String(req.query.pid ?? ''));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ok ? 'התשלום התקבל' : 'התשלום לא הושלם'}</title>
<style>body{font-family:system-ui,Arial;background:#071E33;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center}
main{padding:32px;max-width:420px}h1{font-size:28px}a{display:inline-block;margin-top:20px;background:#16C7F2;color:#04121F;padding:14px 28px;border-radius:14px;text-decoration:none;font-weight:700}</style></head>
<body><main><h1>${ok ? 'התשלום התקבל ✓' : 'התשלום לא הושלם'}</h1>
<p>${ok ? 'אפשר לחזור לאפליקציה - ההזמנה מתעדכנת אוטומטית.' : 'לא בוצע חיוב. אפשר לחזור לאפליקציה ולנסות שוב.'}</p>
<a href="aquashine://payment?pid=${pid}&status=${ok ? 'success' : 'failed'}">חזרה לאפליקציה</a></main></body></html>`);
});
