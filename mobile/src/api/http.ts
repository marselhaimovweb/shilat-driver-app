import { ApiError, type Api, type AppointmentFilters } from './types';

type TokenGetter = () => string | null;

/** Talks to the Node.js server (server/ folder). */
export function createHttpApi(baseUrl: string, getToken: TokenGetter): Api {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getToken();
    let res: Response;
    try {
      res = await fetch(`${baseUrl.replace(/\/$/, '')}/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError('אין חיבור לשרת. בדקו את החיבור לאינטרנט', 0, 'NETWORK');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error ?? 'אירעה שגיאה', res.status, data.code);
    return data as T;
  }

  const qs = (params: Record<string, string | number | undefined | null>) => {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
    return entries.length ? `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
  };

  const get = <T>(path: string) => request<T>('GET', path);
  const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
  const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
  const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
  const del = <T>(path: string) => request<T>('DELETE', path);

  return {
    mode: 'live',
    getConfig: () => get('/public/config'),
    getAvailability: (date, service) => get(`/public/availability${qs({ date, service })}`),

    requestOtp: (phone) => post('/auth/otp/request', { phone }),
    verifyOtp: (phone, code, fullName) => post('/auth/otp/verify', { phone, code, fullName }),
    adminLogin: (username, password) => post('/auth/admin/login', { username, password }),

    getMe: () => get('/me'),
    updateMe: (data) => patch('/me', data),
    getLoyalty: () => get('/me/loyalty'),
    listVehicles: () => get('/me/vehicles'),
    addVehicle: (data) => post('/me/vehicles', data),
    deleteVehicle: (id) => del(`/me/vehicles/${id}`),
    listMyAppointments: (scope, type) => get(`/me/appointments${qs({ scope, type })}`),
    createBooking: (data) => post('/me/appointments', data),
    confirmDemoPayment: (paymentId) => post(`/me/payments/${paymentId}/confirm-demo`),
    cancelMyAppointment: (id) => post(`/me/appointments/${id}/cancel`),
    reviewAppointment: (id, rating, comment) => post(`/me/appointments/${id}/review`, { rating, comment }),

    getDashboard: (date) => get(`/admin/dashboard${qs({ date })}`),
    listAppointments: (f: AppointmentFilters) =>
      get(
        `/admin/appointments${qs({
          from: f.from,
          to: f.to,
          type: f.type,
          status: f.status?.join(','),
          search: f.search,
          customerId: f.customerId,
          order: f.order,
          page: f.page,
          pageSize: f.pageSize,
        })}`,
      ),
    getAppointmentDetails: (id) => get(`/admin/appointments/${id}`),
    setAppointmentStatus: (id, data) => patch(`/admin/appointments/${id}/status`, data),
    setAppointmentNotes: (id, adminNotes) => patch(`/admin/appointments/${id}/notes`, { adminNotes }),
    adminCreateBooking: (data) => post('/admin/appointments', data),
    adminAvailability: (date, service) => get(`/admin/availability${qs({ date, service })}`),
    getCatalog: () => get('/admin/catalog'),
    updatePrices: (prices) => put('/admin/prices', prices),
    updateService: (code, data) => patch(`/admin/services/${code}`, data),
    updateVehicleType: (code, data) => patch(`/admin/vehicle-types/${code}`, data),
    listFeatures: () => get('/admin/features'),
    setFeature: (key, isEnabled) => put(`/admin/features/${key}`, { isEnabled }),
    getAdminSettings: () => get('/admin/settings'),
    updateSettings: (data) => put('/admin/settings', data),
    updateBusinessHours: (hours) => put('/admin/business-hours', hours),
    addClosedDate: (date, reason) => post('/admin/closed-dates', { date, reason }),
    removeClosedDate: (date) => del(`/admin/closed-dates/${date}`),
    listCustomers: (search, page) => get(`/admin/customers${qs({ search, page })}`),
    getCustomer: (id) => get(`/admin/customers/${id}`),
    updateCustomer: (id, data) => patch(`/admin/customers/${id}`, data),
    getReport: (from, to) => get(`/admin/reports${qs({ from, to })}`),
    listReviews: () => get('/admin/reviews'),
  };
}
