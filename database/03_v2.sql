/* =====================================================================
   Version 2 upgrade - run after 01_schema.sql and 02_seed.sql
   (safe to run more than once, SQL Server 2008 compatible)

   Adds: user roles, legal documents + consent records, audit log,
   service add-ons, accessibility requests, online store (products,
   stock, orders), payments for store orders, new switches and settings.
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
USE CarWash;
GO

/* ---------- roles on customer accounts ---------- */
IF COL_LENGTH('dbo.Customers', 'Role') IS NULL
    ALTER TABLE dbo.Customers ADD Role VARCHAR(10) NOT NULL CONSTRAINT DF_Customers_Role DEFAULT ('CUSTOMER')
        CONSTRAINT CK_Customers_Role CHECK (Role IN ('CUSTOMER', 'STAFF', 'MANAGER', 'OWNER'));
GO
IF COL_LENGTH('dbo.Customers', 'DeletedAt') IS NULL
    ALTER TABLE dbo.Customers ADD DeletedAt DATETIME NULL;
GO

/* ---------- legal documents and consents ---------- */
IF OBJECT_ID(N'dbo.LegalDocuments', N'U') IS NULL
CREATE TABLE dbo.LegalDocuments (
    DocKey          VARCHAR(30)    NOT NULL CONSTRAINT PK_LegalDocuments PRIMARY KEY,
    TitleHe         NVARCHAR(100)  NOT NULL,
    Content         NVARCHAR(MAX)  NOT NULL,
    Version         INT            NOT NULL CONSTRAINT DF_LegalDocuments_Version DEFAULT (1),
    RequiresConsent BIT            NOT NULL CONSTRAINT DF_LegalDocuments_Consent DEFAULT (0),
    SortOrder       INT            NOT NULL CONSTRAINT DF_LegalDocuments_Sort DEFAULT (0),
    UpdatedAt       DATETIME       NOT NULL CONSTRAINT DF_LegalDocuments_Updated DEFAULT (GETDATE()),
    UpdatedBy       NVARCHAR(100)  NULL
);
GO

/* proof of what each customer agreed to, and when */
IF OBJECT_ID(N'dbo.ConsentRecords', N'U') IS NULL
CREATE TABLE dbo.ConsentRecords (
    ConsentId  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ConsentRecords PRIMARY KEY,
    CustomerId INT          NOT NULL CONSTRAINT FK_ConsentRecords_Customers REFERENCES dbo.Customers (CustomerId),
    DocKey     VARCHAR(30)  NOT NULL,
    Version    INT          NOT NULL,
    AcceptedAt DATETIME     NOT NULL CONSTRAINT DF_ConsentRecords_Accepted DEFAULT (GETDATE()),
    IpAddress  VARCHAR(45)  NULL,
    UserAgent  NVARCHAR(200) NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ConsentRecords_Customer')
    CREATE INDEX IX_ConsentRecords_Customer ON dbo.ConsentRecords (CustomerId, DocKey, Version);
GO

/* ---------- audit log of management actions ---------- */
IF OBJECT_ID(N'dbo.AuditLog', N'U') IS NULL
CREATE TABLE dbo.AuditLog (
    AuditId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AuditLog PRIMARY KEY,
    ActorType  VARCHAR(10)    NOT NULL, /* ADMIN | CUSTOMER | SYSTEM */
    ActorId    INT            NULL,
    ActorName  NVARCHAR(100)  NULL,
    Action     VARCHAR(50)    NOT NULL,
    EntityType VARCHAR(30)    NULL,
    EntityId   VARCHAR(50)    NULL,
    Details    NVARCHAR(1000) NULL,
    IpAddress  VARCHAR(45)    NULL,
    CreatedAt  DATETIME       NOT NULL CONSTRAINT DF_AuditLog_Created DEFAULT (GETDATE())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLog_Created')
    CREATE INDEX IX_AuditLog_Created ON dbo.AuditLog (CreatedAt DESC);
GO

/* ---------- service add-ons (wax, polish ...) ---------- */
IF OBJECT_ID(N'dbo.ServiceAddons', N'U') IS NULL
CREATE TABLE dbo.ServiceAddons (
    Code            VARCHAR(20)   NOT NULL CONSTRAINT PK_ServiceAddons PRIMARY KEY,
    NameHe          NVARCHAR(50)  NOT NULL,
    DescriptionHe   NVARCHAR(200) NULL,
    Price           DECIMAL(10,2) NOT NULL CONSTRAINT CK_ServiceAddons_Price CHECK (Price >= 0),
    DurationMinutes INT           NOT NULL CONSTRAINT DF_ServiceAddons_Duration DEFAULT (0),
    SortOrder       INT           NOT NULL CONSTRAINT DF_ServiceAddons_Sort DEFAULT (0),
    IsActive        BIT           NOT NULL CONSTRAINT DF_ServiceAddons_Active DEFAULT (1)
);
GO
IF OBJECT_ID(N'dbo.AppointmentAddons', N'U') IS NULL
CREATE TABLE dbo.AppointmentAddons (
    AppointmentId INT           NOT NULL CONSTRAINT FK_AppointmentAddons_Appointments REFERENCES dbo.Appointments (AppointmentId),
    AddonCode     VARCHAR(20)   NOT NULL,
    NameHe        NVARCHAR(50)  NOT NULL,
    Price         DECIMAL(10,2) NOT NULL,
    CONSTRAINT PK_AppointmentAddons PRIMARY KEY (AppointmentId, AddonCode)
);
GO
IF COL_LENGTH('dbo.Appointments', 'AddonsTotal') IS NULL
    ALTER TABLE dbo.Appointments ADD AddonsTotal DECIMAL(10,2) NOT NULL CONSTRAINT DF_Appointments_AddonsTotal DEFAULT (0);
GO
IF COL_LENGTH('dbo.Appointments', 'NeedsAccessibility') IS NULL
    ALTER TABLE dbo.Appointments ADD NeedsAccessibility BIT NOT NULL CONSTRAINT DF_Appointments_Accessibility DEFAULT (0);
GO
IF COL_LENGTH('dbo.Appointments', 'TermsVersion') IS NULL
    ALTER TABLE dbo.Appointments ADD TermsVersion INT NULL;
GO

/* ---------- store ---------- */
IF OBJECT_ID(N'dbo.ProductCategories', N'U') IS NULL
CREATE TABLE dbo.ProductCategories (
    CategoryId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ProductCategories PRIMARY KEY,
    NameHe     NVARCHAR(50) NOT NULL,
    IconName   VARCHAR(50)  NULL,
    SortOrder  INT          NOT NULL CONSTRAINT DF_ProductCategories_Sort DEFAULT (0),
    IsActive   BIT          NOT NULL CONSTRAINT DF_ProductCategories_Active DEFAULT (1)
);
GO
IF OBJECT_ID(N'dbo.Products', N'U') IS NULL
CREATE TABLE dbo.Products (
    ProductId         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Products PRIMARY KEY,
    CategoryId        INT            NULL CONSTRAINT FK_Products_Categories REFERENCES dbo.ProductCategories (CategoryId),
    Sku               VARCHAR(40)    NULL,
    NameHe            NVARCHAR(100)  NOT NULL,
    DescriptionHe     NVARCHAR(1000) NULL,
    UsageWarnings     NVARCHAR(500)  NULL, /* safety info required for chemicals */
    Price             DECIMAL(10,2)  NOT NULL CONSTRAINT CK_Products_Price CHECK (Price >= 0),
    CompareAtPrice    DECIMAL(10,2)  NULL,
    Stock             INT            NOT NULL CONSTRAINT DF_Products_Stock DEFAULT (0),
    LowStockThreshold INT            NOT NULL CONSTRAINT DF_Products_LowStock DEFAULT (3),
    ImageUrl          NVARCHAR(500)  NULL,
    HasImage          BIT            NOT NULL CONSTRAINT DF_Products_HasImage DEFAULT (0),
    IsReturnable      BIT            NOT NULL CONSTRAINT DF_Products_Returnable DEFAULT (1),
    IsActive          BIT            NOT NULL CONSTRAINT DF_Products_Active DEFAULT (1),
    SortOrder         INT            NOT NULL CONSTRAINT DF_Products_Sort DEFAULT (0),
    CreatedAt         DATETIME       NOT NULL CONSTRAINT DF_Products_Created DEFAULT (GETDATE()),
    UpdatedAt         DATETIME       NOT NULL CONSTRAINT DF_Products_Updated DEFAULT (GETDATE())
);
GO
IF OBJECT_ID(N'dbo.ProductImages', N'U') IS NULL
CREATE TABLE dbo.ProductImages (
    ProductId   INT            NOT NULL CONSTRAINT PK_ProductImages PRIMARY KEY
                               CONSTRAINT FK_ProductImages_Products REFERENCES dbo.Products (ProductId),
    ContentType VARCHAR(30)    NOT NULL,
    Data        VARBINARY(MAX) NOT NULL,
    UpdatedAt   DATETIME       NOT NULL CONSTRAINT DF_ProductImages_Updated DEFAULT (GETDATE())
);
GO

IF OBJECT_ID(N'dbo.Orders', N'U') IS NULL
CREATE TABLE dbo.Orders (
    OrderId      INT IDENTITY(5000,1) NOT NULL CONSTRAINT PK_Orders PRIMARY KEY,
    CustomerId   INT            NOT NULL CONSTRAINT FK_Orders_Customers REFERENCES dbo.Customers (CustomerId),
    Status       VARCHAR(20)    NOT NULL CONSTRAINT CK_Orders_Status CHECK (Status IN
                 ('PENDING_PAYMENT', 'PAID', 'PREPARING', 'READY', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'RETURN_REQUESTED', 'REFUNDED')),
    Fulfillment  VARCHAR(10)    NOT NULL CONSTRAINT CK_Orders_Fulfillment CHECK (Fulfillment IN ('PICKUP', 'DELIVERY')),
    Subtotal     DECIMAL(10,2)  NOT NULL,
    DeliveryFee  DECIMAL(10,2)  NOT NULL CONSTRAINT DF_Orders_Delivery DEFAULT (0),
    Total        DECIMAL(10,2)  NOT NULL,
    VatRate      DECIMAL(5,2)   NOT NULL,
    RefundAmount DECIMAL(10,2)  NOT NULL CONSTRAINT DF_Orders_Refund DEFAULT (0),
    ShipName     NVARCHAR(100)  NULL,
    ShipPhone    VARCHAR(20)    NULL,
    ShipAddress  NVARCHAR(200)  NULL,
    ShipCity     NVARCHAR(60)   NULL,
    CustomerNotes NVARCHAR(300) NULL,
    AdminNotes   NVARCHAR(300)  NULL,
    CancelReason NVARCHAR(200)  NULL,
    TermsVersion INT            NULL,
    CreatedAt    DATETIME       NOT NULL CONSTRAINT DF_Orders_Created DEFAULT (GETDATE()),
    PaidAt       DATETIME       NULL,
    DeliveredAt  DATETIME       NULL,
    UpdatedAt    DATETIME       NOT NULL CONSTRAINT DF_Orders_Updated DEFAULT (GETDATE())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_Customer')
    CREATE INDEX IX_Orders_Customer ON dbo.Orders (CustomerId, CreatedAt DESC);
GO
IF OBJECT_ID(N'dbo.OrderItems', N'U') IS NULL
CREATE TABLE dbo.OrderItems (
    OrderId      INT            NOT NULL CONSTRAINT FK_OrderItems_Orders REFERENCES dbo.Orders (OrderId),
    ProductId    INT            NOT NULL CONSTRAINT FK_OrderItems_Products REFERENCES dbo.Products (ProductId),
    NameHe       NVARCHAR(100)  NOT NULL,
    UnitPrice    DECIMAL(10,2)  NOT NULL,
    Quantity     INT            NOT NULL CONSTRAINT CK_OrderItems_Qty CHECK (Quantity > 0),
    LineTotal    DECIMAL(10,2)  NOT NULL,
    IsReturnable BIT            NOT NULL,
    CONSTRAINT PK_OrderItems PRIMARY KEY (OrderId, ProductId)
);
GO
IF OBJECT_ID(N'dbo.StockMovements', N'U') IS NULL
CREATE TABLE dbo.StockMovements (
    MovementId INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_StockMovements PRIMARY KEY,
    ProductId  INT           NOT NULL CONSTRAINT FK_StockMovements_Products REFERENCES dbo.Products (ProductId),
    Delta      INT           NOT NULL,
    Reason     VARCHAR(10)   NOT NULL CONSTRAINT CK_StockMovements_Reason CHECK (Reason IN ('SALE', 'RESTOCK', 'ADJUST', 'RETURN', 'CANCEL')),
    OrderId    INT           NULL,
    Note       NVARCHAR(200) NULL,
    CreatedBy  NVARCHAR(100) NULL,
    CreatedAt  DATETIME      NOT NULL CONSTRAINT DF_StockMovements_Created DEFAULT (GETDATE())
);
GO

/* payments can now belong to an appointment OR a store order */
IF COL_LENGTH('dbo.Payments', 'OrderId') IS NULL
BEGIN
    ALTER TABLE dbo.Payments ALTER COLUMN AppointmentId INT NULL;
    ALTER TABLE dbo.Payments ADD OrderId INT NULL CONSTRAINT FK_Payments_Orders REFERENCES dbo.Orders (OrderId);
    ALTER TABLE dbo.Payments DROP CONSTRAINT CK_Payments_Kind;
    ALTER TABLE dbo.Payments ADD CONSTRAINT CK_Payments_Kind CHECK (Kind IN ('DEPOSIT', 'BALANCE', 'REFUND', 'ORDER'));
END
GO

/* ---------- new switches ---------- */
MERGE dbo.FeatureFlags AS t
USING (VALUES
    ('SERVICE_ADDONS',  N'תוספות לשטיפה',        N'ווקס, פוליש, ניקוי מנוע ועוד - בחירה בזמן ההזמנה', N'הזמנות', 1, 11),
    ('STORE',           N'חנות מוצרים',           N'חנות הציוד באפליקציה - כיבוי מסתיר אותה מהלקוחות',  N'חנות',   1, 12),
    ('STORE_DELIVERY',  N'משלוחים מהחנות',        N'כבוי = איסוף עצמי מהעסק בלבד',                    N'חנות',   1, 13),
    ('ACCESSIBILITY_REQUESTS', N'בקשת סיוע נגישות', N'הלקוח יכול לציין בהזמנה שהוא זקוק לסיוע או התאמה',   N'לקוחות', 1, 14)
) AS s (FlagKey, NameHe, DescriptionHe, GroupName, IsEnabled, SortOrder)
ON t.FlagKey = s.FlagKey
WHEN NOT MATCHED THEN
    INSERT (FlagKey, NameHe, DescriptionHe, GroupName, IsEnabled, SortOrder)
    VALUES (s.FlagKey, s.NameHe, s.DescriptionHe, s.GroupName, s.IsEnabled, s.SortOrder);
GO

/* ---------- new settings ---------- */
MERGE dbo.Settings AS t
USING (VALUES
    ('BUSINESS_LEGAL_NAME',        N''),
    ('BUSINESS_TAX_ID',            N''),
    ('BUSINESS_EMAIL',             N''),
    ('VAT_RATE',                   N'18'),
    ('ACCESSIBILITY_COORDINATOR',  N''),
    ('ACCESSIBILITY_PHONE',        N''),
    ('ACCESSIBILITY_PHYSICAL',     N'חניית נכים צמודה לעמדות השטיפה, מעבר נגיש לאזור ההמתנה ושירותים נגישים.'),
    ('STORE_DELIVERY_FEE',         N'30'),
    ('STORE_FREE_DELIVERY_FROM',   N'250'),
    ('STORE_DELIVERY_DAYS',        N'3-5 ימי עסקים'),
    ('STORE_PICKUP_HOLD_DAYS',     N'14'),
    ('PAYMENT_PROVIDER',           N'MOCK'),
    ('PAYMENT_TEST_MODE',          N'1'),
    ('PAYMENT_TERMINAL',           N''),
    ('PAYMENT_API_USER',           N''),
    ('PAYMENT_API_SECRET',         N''),
    ('INVOICE_PROVIDER',           N'NONE')
) AS s (SettingKey, SettingValue)
ON t.SettingKey = s.SettingKey
WHEN NOT MATCHED THEN
    INSERT (SettingKey, SettingValue) VALUES (s.SettingKey, s.SettingValue);
GO

/* ---------- default add-ons ---------- */
MERGE dbo.ServiceAddons AS t
USING (VALUES
    ('WAX',      N'ווקס מגן',            N'שכבת הגנה ומבריק לצבע, עמידה לשבועות',       40.00, 15, 1),
    ('RIMS',     N'ניקוי חישוקים יסודי',  N'הסרת אבק בלמים ולכלוך עמוק מהחישוקים',        25.00, 10, 2),
    ('ENGINE',   N'ניקוי תא מנוע',        N'ניקוי ושטיפה עדינה של תא המנוע',             60.00, 20, 3),
    ('SEATS',    N'ניקוי ריפודים',        N'ניקוי כתמים וחידוש ריפודי בד',                90.00, 40, 4),
    ('SCENT',    N'ריח לרכב',             N'ריח רענן לבחירה',                             10.00,  0, 5)
) AS s (Code, NameHe, DescriptionHe, Price, DurationMinutes, SortOrder)
ON t.Code = s.Code
WHEN NOT MATCHED THEN
    INSERT (Code, NameHe, DescriptionHe, Price, DurationMinutes, SortOrder, IsActive)
    VALUES (s.Code, s.NameHe, s.DescriptionHe, s.Price, s.DurationMinutes, s.SortOrder, 1);
GO

/* ---------- starter store catalog ---------- */
IF NOT EXISTS (SELECT 1 FROM dbo.ProductCategories)
BEGIN
    INSERT INTO dbo.ProductCategories (NameHe, IconName, SortOrder) VALUES
        (N'שטיפה וניקוי', 'spray-bottle', 1),
        (N'הברקה והגנה', 'shimmer', 2),
        (N'מיקרופייבר ואביזרים', 'hand-wash-outline', 3),
        (N'ריחות לרכב', 'flower-outline', 4);
END
GO
IF NOT EXISTS (SELECT 1 FROM dbo.Products)
BEGIN
    DECLARE @wash INT, @shine INT, @acc INT, @scent INT;
    SELECT @wash = CategoryId FROM dbo.ProductCategories WHERE SortOrder = 1;
    SELECT @shine = CategoryId FROM dbo.ProductCategories WHERE SortOrder = 2;
    SELECT @acc = CategoryId FROM dbo.ProductCategories WHERE SortOrder = 3;
    SELECT @scent = CategoryId FROM dbo.ProductCategories WHERE SortOrder = 4;
    INSERT INTO dbo.Products (CategoryId, Sku, NameHe, DescriptionHe, UsageWarnings, Price, CompareAtPrice, Stock, IsReturnable, SortOrder) VALUES
        (@wash,  'SH-500',  N'שמפו רכב מרוכז 1 ליטר', N'שמפו pH ניטרלי עם קצף עשיר. מתאים לכל סוגי הצבע.', N'להרחיק מהישג ידם של ילדים. במקרה של מגע בעיניים לשטוף במים.', 49.90, 59.90, 25, 1, 1),
        (@wash,  'IN-300',  N'תרסיס לניקוי פנים הרכב', N'מנקה דשבורד, פלסטיקים וריפוד בלי להשאיר שאריות.', N'לא לרסס על מסכים. להרחיק מהישג ידם של ילדים.', 39.90, NULL, 18, 1, 2),
        (@shine, 'WX-250',  N'ווקס קרנאובה', N'הגנה והברקה עמוקה עד 3 חודשים.', N'לא למרוח בשמש ישירה.', 89.90, 109.90, 10, 1, 3),
        (@shine, 'TR-500',  N'מבריק צמיגים', N'מראה שחור עמוק ומגן UV לצמיגים.', N'לא לרסס על משטח הבלימה.', 34.90, NULL, 30, 1, 4),
        (@acc,   'MF-3',    N'סט 3 מגבות מיקרופייבר', N'מגבות 40x40 בעובי 380GSM לייבוש בלי שריטות.', NULL, 29.90, NULL, 40, 1, 5),
        (@acc,   'MT-1',    N'כפפת שטיפה', N'כפפת שניל רכה שאוספת לכלוך בלי לשרוט.', NULL, 24.90, NULL, 3, 1, 6),
        (@scent, 'SC-VAN',  N'ריח לרכב - וניל', N'ריח לתלייה, עד 30 יום.', NULL, 12.90, NULL, 60, 0, 7);
END
GO

/* ---------- one-time update to the business' real values ---------- */
IF NOT EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = 'MIGRATION_V2_APPLIED')
BEGIN
    /* Sunday - Friday 07:30 - 17:00, Saturday closed (editable in the admin panel) */
    UPDATE dbo.BusinessHours SET IsOpen = 1, OpenTime = '07:30', CloseTime = '17:00' WHERE DayOfWeek BETWEEN 0 AND 5;
    UPDATE dbo.BusinessHours SET IsOpen = 0, OpenTime = NULL, CloseTime = NULL WHERE DayOfWeek = 6;
    UPDATE dbo.Settings SET SettingValue = N'4' WHERE SettingKey = 'PARALLEL_BAYS';
    /* consumer-law safe default: never stricter than "2 days before the service" */
    UPDATE dbo.Settings SET SettingValue = N'24' WHERE SettingKey = 'CANCEL_FREE_HOURS' AND CAST(SettingValue AS INT) > 48;
    INSERT INTO dbo.Settings (SettingKey, SettingValue) VALUES ('MIGRATION_V2_APPLIED', CONVERT(NVARCHAR(30), GETDATE(), 120));
END
GO
