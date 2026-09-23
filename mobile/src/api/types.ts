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
  | 'ANNOUNCEMENT_BANNER'
  | 'SERVICE_ADDONS'
  | 'STORE'
  | 'STORE_DELIVERY'
  | 'ACCESSIBILITY_REQUESTS';

export type UserRole = 'CUSTOMER' | AdminRole;

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

export interface Addon {
  code: string;
  nameHe: string;
  descriptionHe: string | null;
  price: number;
  durationMinutes: number;
  sortOrder: number;
  isActive: boolean;
}

export interface Catalog {
  vehicleTypes: VehicleType[];
  services: ServiceType[];
  prices: PriceEntry[];
  addons: Addon[];
}

export type LegalKey = 'TERMS' | 'PRIVACY' | 'CANCELLATION' | 'ACCESSIBILITY';

export interface LegalDocMeta {
  key: LegalKey;
  title: string;
  version: number;
  requiresConsent: boolean;
  updatedAt: string;
}

export interface LegalDoc extends LegalDocMeta {
  content: string;
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
  business: {
    name: string;
    phone: string;
    address: string;
    announcement: string;
    legalName: string;
    taxId: string;
    email: string;
    accessibilityCoordinator: string;
    accessibilityPhone: string;
  };
  rules: {
    depositAmount: number;
    futureMaxDays: number;
    cancelFreeHours: number;
    paymentHoldMinutes: number;
    loyaltyPunchesForFree: number;
    vatRate: number;
    storeDeliveryFee: number;
    storeFreeDeliveryFrom: number;
    storeDeliveryDays: string;
    storePickupHoldDays: number;
  };
  legal: LegalDocMeta[];
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
  role?: UserRole;
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
  addonsTotal?: number;
  addonNames?: string | null;
  needsAccessibility?: boolean;
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
  /** customer = logged in with phone (may also be staff), admin = panel username account */
  role: 'customer' | 'admin';
  name: string | null;
  /** staff role for management access (panel accounts and promoted customers) */
  adminRole?: AdminRole;
}

export interface PaymentResult {
  type: 'APPOINTMENT' | 'ORDER';
  id: number;
}

/* ---------- store ---------- */

export interface ProductCategory {
  id: number;
  nameHe: string;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Product {
  id: number;
  categoryId: number | null;
  categoryName?: string | null;
  sku: string | null;
  nameHe: string;
  descriptionHe: string | null;
  usageWarnings: string | null;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  lowStockThreshold: number;
  imageUrl: string | null;
  hasImage: boolean;
  isReturnable: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface StoreCatalog {
  enabled?: boolean;
  categories: ProductCategory[];
  products: Product[];
}

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

export interface OrderItem {
  productId: number;
  nameHe: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isReturnable: boolean;
  hasImage?: boolean;
  imageUrl?: string | null;
}

export interface Order {
  id: number;
  customerId: number;
  customerName: string | null;
  customerPhone: string;
  status: OrderStatus;
  fulfillment: 'PICKUP' | 'DELIVERY';
  subtotal: number;
  deliveryFee: number;
  total: number;
  vatRate: number;
  refundAmount: number;
  shipName: string | null;
  shipPhone: string | null;
  shipAddress: string | null;
  shipCity: string | null;
  customerNotes: string | null;
  adminNotes: string | null;
  cancelReason: string | null;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  itemCount: number;
  items?: OrderItem[];
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

export interface OrderResult {
  order: Order;
  payment: PaymentIntent;
  holdMinutes: number;
}

export interface StockMovement {
  id: number;
  delta: number;
  reason: 'SALE' | 'RESTOCK' | 'ADJUST' | 'RETURN' | 'CANCEL';
  orderId: number | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export type ProductInput = Omit<Product, 'id' | 'categoryName' | 'stock' | 'hasImage' | 'sortOrder'> & { stock?: number; sortOrder?: number };

/* ---------- team, payments, audit ---------- */

export interface TeamMember {
  id: number;
  fullName: string | null;
  phone: string;
  role: AdminRole;
  lastLoginAt: string | null;
}

export interface PanelUser {
  id: number;
  username: string;
  fullName: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface PaymentSettings {
  provider: 'MOCK' | 'CARDCOM' | 'TRANZILA';
  testMode: boolean;
  terminal: string;
  apiUser: string;
  apiSecret: string;
  hasSecret: boolean;
  invoiceProvider: string;
}

export interface PaymentProviderInfo {
  code: PaymentSettings['provider'];
  name: string;
  fields: ('terminal' | 'apiUser' | 'apiSecret')[];
}

export interface AuditEntry {
  id: number;
  actorType: string;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
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
  store?: { ordersToHandle: number; lowStock: number; storeRevenueMonth: number };
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
  role?: UserRole;
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
  role?: UserRole;
  marketingOptIn?: boolean;
  termsAcceptedAt?: string | null;
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
  vatRate: number;
  storeDeliveryFee: number;
  storeFreeDeliveryFrom: number;
  storePickupHoldDays: number;
  businessLegalName: string;
  businessTaxId: string;
  businessEmail: string;
  accessibilityCoordinator: string;
  accessibilityPhone: string;
  accessibilityPhysical: string;
  storeDeliveryDays: string;
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
  addonCodes?: string[];
  needsAccessibility?: boolean;
}

export interface Api {
  mode: 'live' | 'demo';
  // public
  getConfig(): Promise<PublicConfig>;
  getAvailability(date: string, serviceCode: string, addonCodes?: string[]): Promise<Availability>;
  getLegalDoc(key: LegalKey): Promise<LegalDoc>;
  getStore(): Promise<StoreCatalog>;
  productImageUrl(product: Pick<Product, 'id' | 'hasImage' | 'imageUrl'>): string | null;
  // auth
  requestOtp(phone: string): Promise<{ ok: true; devCode?: string }>;
  verifyOtp(phone: string, code: string, fullName?: string): Promise<{ token: string; isNew: boolean; customer: Customer }>;
  getPendingConsents(): Promise<LegalDocMeta[]>;
  acceptConsents(keys: LegalKey[]): Promise<LegalDocMeta[]>;
  deleteAccount(): Promise<void>;
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
    addonCodes?: string[];
    needsAccessibility?: boolean;
  }): Promise<BookingResult>;
  confirmDemoPayment(paymentId: number): Promise<PaymentResult>;
  getPaymentStatus(paymentId: number): Promise<{ status: string; type: PaymentResult['type']; targetId: number }>;
  createOrder(input: OrderInput): Promise<OrderResult>;
  listMyOrders(): Promise<Order[]>;
  getMyOrder(id: number): Promise<Order>;
  cancelMyOrder(id: number, reason?: string): Promise<{ refunded: boolean; returnRequested: boolean }>;
  cancelMyAppointment(id: number): Promise<{ refunded: boolean }>;
  reviewAppointment(id: number, rating: number, comment?: string): Promise<void>;
  // admin
  getAdminMe(): Promise<{ id: number; kind: 'panel' | 'customer'; role: AdminRole; name: string }>;
  getDashboard(date?: string): Promise<Dashboard>;
  listAppointments(filters: AppointmentFilters): Promise<Paged<Appointment>>;
  getAppointmentDetails(id: number): Promise<AppointmentDetails>;
  setAppointmentStatus(
    id: number,
    data: { status: AppointmentStatus; paymentMethod?: PaymentMethod; refundDeposit?: boolean; reason?: string; discount?: number },
  ): Promise<void>;
  setAppointmentNotes(id: number, adminNotes: string): Promise<void>;
  adminCreateBooking(data: AdminBookingInput): Promise<BookingResult>;
  adminAvailability(date: string, serviceCode: string, addonCodes?: string[]): Promise<Availability>;
  saveAddon(code: string, data: Omit<Addon, 'code' | 'sortOrder'> & { sortOrder?: number }): Promise<Catalog>;
  getPaymentSettings(): Promise<{ settings: PaymentSettings; providers: PaymentProviderInfo[] }>;
  savePaymentSettings(data: Omit<PaymentSettings, 'hasSecret' | 'apiSecret'> & { apiSecret?: string }): Promise<{ settings: PaymentSettings; providers: PaymentProviderInfo[] }>;
  listLegalDocs(): Promise<LegalDocMeta[]>;
  getLegalDocRaw(key: LegalKey): Promise<LegalDoc>;
  saveLegalDoc(key: LegalKey, data: { title: string; content: string; newVersion: boolean }): Promise<LegalDoc>;
  getTeam(): Promise<{ staff: TeamMember[]; panelUsers: PanelUser[] }>;
  setUserRole(phone: string, role: UserRole, fullName?: string): Promise<void>;
  createPanelUser(data: { username: string; fullName: string; password: string; role: AdminRole }): Promise<void>;
  updatePanelUser(id: number, data: { isActive?: boolean; role?: AdminRole; password?: string }): Promise<void>;
  changeMyPassword(current: string, next: string): Promise<void>;
  listAudit(page?: number): Promise<AuditEntry[]>;
  adminGetStore(): Promise<StoreCatalog>;
  createCategory(data: { nameHe: string; iconName?: string }): Promise<StoreCatalog>;
  updateCategory(id: number, data: Partial<Pick<ProductCategory, 'nameHe' | 'isActive' | 'sortOrder'>>): Promise<StoreCatalog>;
  createProduct(data: ProductInput): Promise<{ id: number }>;
  updateProduct(id: number, data: ProductInput): Promise<void>;
  uploadProductImage(id: number, base64: string, contentType: string): Promise<void>;
  deleteProductImage(id: number): Promise<void>;
  adjustStock(id: number, delta: number, reason: 'RESTOCK' | 'ADJUST', note?: string): Promise<void>;
  listStockMovements(id: number): Promise<StockMovement[]>;
  adminListOrders(status?: OrderStatus[], page?: number): Promise<Order[]>;
  adminGetOrder(id: number): Promise<Order>;
  adminSetOrderStatus(id: number, data: { status: OrderStatus; reason?: string; refundAmount?: number; restock?: boolean }): Promise<Order>;
  adminSetOrderNotes(id: number, adminNotes: string): Promise<void>;
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
