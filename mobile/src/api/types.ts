export type BookingType = 'REGULAR' | 'FUTURE';
export type AppointmentStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type DepositStatus = 'NONE' | 'PENDING' | 'PAID' | 'APPLIED' | 'REFUNDED' | 'FORFEITED';
export type PaymentMethod = 'CASH' | 'CARD' | 'BIT' | 'APP';
export type AdminRole = 'OWNER' | 'MANAGER' | 'STAFF';

export type FeatureKey =
  | 'BOOKING_SYSTEM'
  | 'REGULAR_BOOKING'
  | 'FUTURE_BOOKING'
  | 'FUTURE_DEPOSIT'
  | 'CUSTOMER_CANCEL'
  | 'NEW_REGISTRATIONS'
  | 'LOYALTY_PROGRAM'
  | 'REVIEWS'
  | 'SMS_NOTIFICATIONS'
  | 'ANNOUNCEMENT_BANNER';

export interface VehicleType {
  code: string;
  nameHe: string;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ServiceType {
  code: string;
  nameHe: string;
  descriptionHe: string | null;
  durationMinutes: number;
  sortOrder: number;
  isActive: boolean;
}

export interface PriceEntry {
  vehicleTypeCode: string;
  serviceCode: string;
  price: number;
}

export interface Catalog {
  vehicleTypes: VehicleType[];
  services: ServiceType[];
  prices: PriceEntry[];
}

export interface BusinessHour {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

export interface ClosedDate {
  date: string;
  reason: string | null;
}

export interface PublicConfig extends Catalog {
  today: string;
  features: Record<FeatureKey, boolean>;
  business: { name: string; phone: string; address: string; announcement: string };
  rules: {
    depositAmount: number;
    futureMaxDays: number;
    cancelFreeHours: number;
    paymentHoldMinutes: number;
    loyaltyPunchesForFree: number;
  };
  businessHours: BusinessHour[];
  closedDates: ClosedDate[];
}

export interface Slot {
  time: string;
  available: boolean;
  remaining: number;
}

export interface Availability {
  date: string;
  isOpen: boolean;
  reason?: string;
  openTime?: string;
  closeTime?: string;
  slots: Slot[];
}

export interface Customer {
  id: number;
  phone: string;
  fullName: string | null;
  email?: string | null;
  loyaltyPunches: number;
  marketingOptIn?: boolean;
  completedWashes?: number;
}

export interface Vehicle {
  id: number;
  plateNumber: string;
  vehicleTypeCode: string;
  vehicleTypeName?: string;
  nickname: string | null;
  color?: string | null;
}

export interface Appointment {
  id: number;
  bookingType: BookingType;
  source: 'APP' | 'ADMIN' | 'WALKIN' | 'PHONE';
  customerId: number;
  customerName: string | null;
  customerPhone: string;
  vehicleId: number | null;
  plateNumber: string | null;
  vehicleTypeCode: string;
  vehicleTypeName: string;
  serviceCode: string;
  serviceName: string;
  date: string;
  time: string;
  durationMinutes: number;
  price: number;
  discountAmount: number;
  depositAmount: number;
  depositStatus: DepositStatus;
  status: AppointmentStatus;
  amountPaid: number;
  paymentMethod: PaymentMethod | null;
  isFreeLoyalty: boolean;
  customerNotes: string | null;
  adminNotes: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  createdAt: string;
  completedAt: string | null;
  rating: number | null;
  reviewComment: string | null;
}

export interface AppointmentDetails extends Appointment {
  log: { oldStatus: string | null; newStatus: string; changedBy: string; changedAt: string }[];
  payments: { id: number; kind: string; amount: number; provider: string; status: string; createdAt: string }[];
}

export interface PaymentIntent {
  id: number;
  amount: number;
  provider: string;
  checkoutUrl: string | null;
}

export interface BookingResult {
  appointment: Appointment;
  payment: PaymentIntent | null;
  holdMinutes?: number;
}

export interface Session {
  token: string;
  role: 'customer' | 'admin';
  name: string | null;
  adminRole?: AdminRole;
}

export interface Loyalty {
  enabled: boolean;
  punches: number;
  punchesForFree: number;
}

export interface Dashboard {
  date: string;
  today: {
    totalToday: number;
    waitingToday: number;
    inProgressToday: number;
    completedToday: number;
    noShowToday: number;
    revenueToday: number;
    expectedToday: number;
    regularToday: number;
    futureToday: number;
  };
  periods: {
    revenueWeek: number;
    revenueMonth: number;
    washesMonth: number;
    noShow30: number;
    closed30: number;
    depositsHeld: number;
    futureBooked: number;
    newCustomersMonth: number;
  };
  revenueSeries: { date: string; revenue: number; washes: number }[];
  serviceSplit: { name: string; count: number }[];
  queue: Appointment[];
  reviews: { avgRating: number; reviewCount: number };
  occupancy: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AppointmentFilters {
  from?: string;
  to?: string;
  type?: BookingType;
  status?: AppointmentStatus[];
  search?: string;
  customerId?: number;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CustomerSummary {
  id: number;
  phone: string;
  fullName: string | null;
  isBlocked: boolean;
  loyaltyPunches: number;
  visits: number;
  totalSpent: number;
  lastVisit: string | null;
  noShows: number;
}

export interface CustomerDetails {
  id: number;
  phone: string;
  fullName: string | null;
  email: string | null;
  isBlocked: boolean;
  adminNotes: string | null;
  loyaltyPunches: number;
  createdAt: string;
  vehicles: Vehicle[];
  appointments: Appointment[];
}

export interface FeatureFlag {
  key: FeatureKey;
  nameHe: string;
  descriptionHe: string | null;
  groupName: string;
  isEnabled: boolean;
}

export interface AdminSettings {
  depositAmount: number;
  slotIntervalMinutes: number;
  parallelBays: number;
  futureMaxDays: number;
  regularMinLeadMinutes: number;
  cancelFreeHours: number;
  paymentHoldMinutes: number;
  loyaltyPunchesForFree: number;
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  announcementText: string;
}

export interface Report {
  from: string;
  to: string;
  summary: {
    total: number;
    completed: number;
    cancelled: number;
    noShow: number;
    regularCompleted: number;
    futureCompleted: number;
    futureNotCompleted: number;
    revenue: number;
    depositsForfeited: number;
    depositsRefunded: number;
    depositsCollected: number;
    discounts: number;
  };
  byDay: { date: string; revenue: number; washes: number }[];
  byService: { name: string; washes: number; revenue: number }[];
  byVehicle: { name: string; washes: number; revenue: number }[];
  byHour: { hour: number; washes: number }[];
  topCustomers: { id: number; fullName: string | null; phone: string; washes: number; revenue: number }[];
}

export interface Review {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  customerName: string | null;
  appointmentId: number;
  serviceName: string;
}

export interface AdminBookingInput {
  phone: string;
  fullName?: string;
  plateNumber?: string;
  vehicleTypeCode: string;
  serviceCode: string;
  date: string;
  time: string;
  source: 'ADMIN' | 'WALKIN' | 'PHONE';
  notes?: string;
}

export interface Api {
  mode: 'live' | 'demo';
  // public
  getConfig(): Promise<PublicConfig>;
  getAvailability(date: string, serviceCode: string): Promise<Availability>;
  // auth
  requestOtp(phone: string): Promise<{ ok: true; devCode?: string }>;
  verifyOtp(phone: string, code: string, fullName?: string): Promise<{ token: string; isNew: boolean; customer: Customer }>;
  adminLogin(username: string, password: string): Promise<{ token: string; admin: { id: number; fullName: string; role: AdminRole } }>;
  // customer
  getMe(): Promise<Customer>;
  updateMe(data: { fullName?: string; email?: string; marketingOptIn?: boolean }): Promise<void>;
  getLoyalty(): Promise<Loyalty>;
  listVehicles(): Promise<Vehicle[]>;
  addVehicle(data: { plateNumber: string; vehicleTypeCode: string; nickname?: string }): Promise<{ id: number }>;
  deleteVehicle(id: number): Promise<void>;
  listMyAppointments(scope: 'upcoming' | 'history' | 'all', type?: BookingType): Promise<Appointment[]>;
  createBooking(data: {
    date: string;
    time: string;
    serviceCode: string;
    vehicleId: number;
    notes?: string;
    useLoyalty?: boolean;
  }): Promise<BookingResult>;
  confirmDemoPayment(paymentId: number): Promise<Appointment>;
  cancelMyAppointment(id: number): Promise<{ refunded: boolean }>;
  reviewAppointment(id: number, rating: number, comment?: string): Promise<void>;
  // admin
  getDashboard(date?: string): Promise<Dashboard>;
  listAppointments(filters: AppointmentFilters): Promise<Paged<Appointment>>;
  getAppointmentDetails(id: number): Promise<AppointmentDetails>;
  setAppointmentStatus(
    id: number,
    data: { status: AppointmentStatus; paymentMethod?: PaymentMethod; refundDeposit?: boolean; reason?: string; discount?: number },
  ): Promise<void>;
  setAppointmentNotes(id: number, adminNotes: string): Promise<void>;
  adminCreateBooking(data: AdminBookingInput): Promise<BookingResult>;
  adminAvailability(date: string, serviceCode: string): Promise<Availability>;
  getCatalog(): Promise<Catalog>;
  updatePrices(prices: PriceEntry[]): Promise<Catalog>;
  updateService(code: string, data: Partial<Pick<ServiceType, 'nameHe' | 'descriptionHe' | 'durationMinutes' | 'isActive'>>): Promise<Catalog>;
  updateVehicleType(code: string, data: Partial<Pick<VehicleType, 'nameHe' | 'isActive'>>): Promise<Catalog>;
  listFeatures(): Promise<FeatureFlag[]>;
  setFeature(key: FeatureKey, isEnabled: boolean): Promise<void>;
  getAdminSettings(): Promise<{ settings: AdminSettings; businessHours: BusinessHour[]; closedDates: ClosedDate[] }>;
  updateSettings(data: Partial<AdminSettings>): Promise<AdminSettings>;
  updateBusinessHours(hours: BusinessHour[]): Promise<BusinessHour[]>;
  addClosedDate(date: string, reason?: string): Promise<ClosedDate[]>;
  removeClosedDate(date: string): Promise<ClosedDate[]>;
  listCustomers(search?: string, page?: number): Promise<Paged<CustomerSummary>>;
  getCustomer(id: number): Promise<CustomerDetails>;
  updateCustomer(id: number, data: { isBlocked?: boolean; adminNotes?: string; loyaltyPunches?: number }): Promise<void>;
  getReport(from: string, to: string): Promise<Report>;
  listReviews(): Promise<Review[]>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
