/* =====================================================================
   Car Wash Booking - database schema
   Target: Microsoft SQL Server 2008 / 2008 R2 (compatibility level 100)

   Notes about 2008 compatibility (deliberately avoided features):
   - no OFFSET/FETCH (paging uses ROW_NUMBER)
   - no IIF / CHOOSE / CONCAT / FORMAT / TRY_CONVERT
   - no THROW (errors use RAISERROR)
   - no SEQUENCE objects (IDENTITY only)
   DATE / TIME / DATETIME2 types are available since 2008 and are used.
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_ID(N'CarWash') IS NULL
    CREATE DATABASE CarWash COLLATE Hebrew_CI_AS;
GO

USE CarWash;
GO

/* ---------- lookups ---------- */

IF OBJECT_ID(N'dbo.VehicleTypes', N'U') IS NULL
CREATE TABLE dbo.VehicleTypes (
    Code        VARCHAR(20)   NOT NULL CONSTRAINT PK_VehicleTypes PRIMARY KEY,
    NameHe      NVARCHAR(50)  NOT NULL,
    IconName    VARCHAR(50)   NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_VehicleTypes_Sort DEFAULT (0),
    IsActive    BIT           NOT NULL CONSTRAINT DF_VehicleTypes_Active DEFAULT (1)
);
GO

IF OBJECT_ID(N'dbo.ServiceTypes', N'U') IS NULL
CREATE TABLE dbo.ServiceTypes (
    Code            VARCHAR(20)   NOT NULL CONSTRAINT PK_ServiceTypes PRIMARY KEY,
    NameHe          NVARCHAR(50)  NOT NULL,
    DescriptionHe   NVARCHAR(200) NULL,
    DurationMinutes INT           NOT NULL CONSTRAINT DF_ServiceTypes_Duration DEFAULT (30),
    SortOrder       INT           NOT NULL CONSTRAINT DF_ServiceTypes_Sort DEFAULT (0),
    IsActive        BIT           NOT NULL CONSTRAINT DF_ServiceTypes_Active DEFAULT (1)
);
GO

/* price matrix: vehicle type x service type, editable from the admin panel */
IF OBJECT_ID(N'dbo.Prices', N'U') IS NULL
CREATE TABLE dbo.Prices (
    VehicleTypeCode VARCHAR(20)   NOT NULL CONSTRAINT FK_Prices_VehicleTypes REFERENCES dbo.VehicleTypes (Code),
    ServiceCode     VARCHAR(20)   NOT NULL CONSTRAINT FK_Prices_ServiceTypes REFERENCES dbo.ServiceTypes (Code),
    Price           DECIMAL(10,2) NOT NULL CONSTRAINT CK_Prices_Positive CHECK (Price >= 0),
    UpdatedAt       DATETIME      NOT NULL CONSTRAINT DF_Prices_Updated DEFAULT (GETDATE()),
    UpdatedBy       INT           NULL,
    CONSTRAINT PK_Prices PRIMARY KEY (VehicleTypeCode, ServiceCode)
);
GO

/* audit trail for price changes */
IF OBJECT_ID(N'dbo.PriceHistory', N'U') IS NULL
CREATE TABLE dbo.PriceHistory (
    PriceHistoryId  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PriceHistory PRIMARY KEY,
    VehicleTypeCode VARCHAR(20)   NOT NULL,
    ServiceCode     VARCHAR(20)   NOT NULL,
    OldPrice        DECIMAL(10,2) NULL,
    NewPrice        DECIMAL(10,2) NOT NULL,
    ChangedAt       DATETIME      NOT NULL CONSTRAINT DF_PriceHistory_Changed DEFAULT (GETDATE()),
    ChangedBy       INT           NULL
);
GO

/* ---------- system on/off switches + settings ---------- */

IF OBJECT_ID(N'dbo.FeatureFlags', N'U') IS NULL
CREATE TABLE dbo.FeatureFlags (
    FlagKey       VARCHAR(50)   NOT NULL CONSTRAINT PK_FeatureFlags PRIMARY KEY,
    NameHe        NVARCHAR(100) NOT NULL,
    DescriptionHe NVARCHAR(300) NULL,
    GroupName     NVARCHAR(50)  NOT NULL CONSTRAINT DF_FeatureFlags_Group DEFAULT (N'כללי'),
    IsEnabled     BIT           NOT NULL CONSTRAINT DF_FeatureFlags_Enabled DEFAULT (1),
    SortOrder     INT           NOT NULL CONSTRAINT DF_FeatureFlags_Sort DEFAULT (0),
    UpdatedAt     DATETIME      NOT NULL CONSTRAINT DF_FeatureFlags_Updated DEFAULT (GETDATE()),
    UpdatedBy     INT           NULL
);
GO

IF OBJECT_ID(N'dbo.Settings', N'U') IS NULL
CREATE TABLE dbo.Settings (
    SettingKey   VARCHAR(50)    NOT NULL CONSTRAINT PK_Settings PRIMARY KEY,
    SettingValue NVARCHAR(1000) NULL,
    UpdatedAt    DATETIME       NOT NULL CONSTRAINT DF_Settings_Updated DEFAULT (GETDATE())
);
GO

/* 0 = Sunday ... 6 = Saturday */
IF OBJECT_ID(N'dbo.BusinessHours', N'U') IS NULL
CREATE TABLE dbo.BusinessHours (
    DayOfWeek  TINYINT NOT NULL CONSTRAINT PK_BusinessHours PRIMARY KEY CONSTRAINT CK_BusinessHours_Day CHECK (DayOfWeek BETWEEN 0 AND 6),
    IsOpen     BIT     NOT NULL,
    OpenTime   TIME(0) NULL,
    CloseTime  TIME(0) NULL
);
GO

IF OBJECT_ID(N'dbo.ClosedDates', N'U') IS NULL
CREATE TABLE dbo.ClosedDates (
    ClosedDate DATE          NOT NULL CONSTRAINT PK_ClosedDates PRIMARY KEY,
    Reason     NVARCHAR(100) NULL
);
GO

/* ---------- people ---------- */

IF OBJECT_ID(N'dbo.AdminUsers', N'U') IS NULL
CREATE TABLE dbo.AdminUsers (
    AdminId      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AdminUsers PRIMARY KEY,
    Username     VARCHAR(50)   NOT NULL CONSTRAINT UQ_AdminUsers_Username UNIQUE,
    PasswordHash VARCHAR(100)  NOT NULL,
    FullName     NVARCHAR(100) NOT NULL,
    Role         VARCHAR(20)   NOT NULL CONSTRAINT DF_AdminUsers_Role DEFAULT ('OWNER')
                               CONSTRAINT CK_AdminUsers_Role CHECK (Role IN ('OWNER', 'MANAGER', 'STAFF')),
    IsActive     BIT           NOT NULL CONSTRAINT DF_AdminUsers_Active DEFAULT (1),
    CreatedAt    DATETIME      NOT NULL CONSTRAINT DF_AdminUsers_Created DEFAULT (GETDATE()),
    LastLoginAt  DATETIME      NULL
);
GO

IF OBJECT_ID(N'dbo.Customers', N'U') IS NULL
CREATE TABLE dbo.Customers (
    CustomerId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Customers PRIMARY KEY,
    Phone          VARCHAR(20)   NOT NULL CONSTRAINT UQ_Customers_Phone UNIQUE,
    FullName       NVARCHAR(100) NULL,
    Email          NVARCHAR(150) NULL,
    IsBlocked      BIT           NOT NULL CONSTRAINT DF_Customers_Blocked DEFAULT (0),
    AdminNotes     NVARCHAR(500) NULL,
    LoyaltyPunches INT           NOT NULL CONSTRAINT DF_Customers_Punches DEFAULT (0),
    MarketingOptIn BIT           NOT NULL CONSTRAINT DF_Customers_Marketing DEFAULT (0),
    CreatedAt      DATETIME      NOT NULL CONSTRAINT DF_Customers_Created DEFAULT (GETDATE()),
    LastLoginAt    DATETIME      NULL
);
GO

IF OBJECT_ID(N'dbo.Vehicles', N'U') IS NULL
CREATE TABLE dbo.Vehicles (
    VehicleId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Vehicles PRIMARY KEY,
    CustomerId      INT          NOT NULL CONSTRAINT FK_Vehicles_Customers REFERENCES dbo.Customers (CustomerId),
    PlateNumber     VARCHAR(15)  NOT NULL,
    VehicleTypeCode VARCHAR(20)  NOT NULL CONSTRAINT FK_Vehicles_VehicleTypes REFERENCES dbo.VehicleTypes (Code),
    Nickname        NVARCHAR(50) NULL,
    Color           NVARCHAR(30) NULL,
    IsDeleted       BIT          NOT NULL CONSTRAINT DF_Vehicles_Deleted DEFAULT (0),
    CreatedAt       DATETIME     NOT NULL CONSTRAINT DF_Vehicles_Created DEFAULT (GETDATE())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Vehicles_Customer')
    CREATE INDEX IX_Vehicles_Customer ON dbo.Vehicles (CustomerId) WHERE IsDeleted = 0;
GO

IF OBJECT_ID(N'dbo.OtpCodes', N'U') IS NULL
CREATE TABLE dbo.OtpCodes (
    OtpId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_OtpCodes PRIMARY KEY,
    Phone     VARCHAR(20)  NOT NULL,
    CodeHash  VARCHAR(100) NOT NULL,
    ExpiresAt DATETIME     NOT NULL,
    Attempts  INT          NOT NULL CONSTRAINT DF_OtpCodes_Attempts DEFAULT (0),
    UsedAt    DATETIME     NULL,
    CreatedAt DATETIME     NOT NULL CONSTRAINT DF_OtpCodes_Created DEFAULT (GETDATE())
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_OtpCodes_Phone')
    CREATE INDEX IX_OtpCodes_Phone ON dbo.OtpCodes (Phone, CreatedAt DESC);
GO

/* ---------- appointments ---------- */
/*
   BookingType:
     REGULAR - same-day appointment, paid at the car wash, no deposit
     FUTURE  - appointment on a future date, secured by a deposit (default 20 NIS)
   Status:
     PENDING_PAYMENT - FUTURE booking waiting for the deposit (held for a few minutes)
     CONFIRMED       - booked
     IN_PROGRESS     - car is being washed
     COMPLETED       - done ("בוצע")
     CANCELLED       - cancelled by customer / business / payment timeout
     NO_SHOW         - customer did not arrive ("לא בוצע")
   DepositStatus:
     NONE | PENDING | PAID | APPLIED (deducted from final price) | REFUNDED | FORFEITED
*/
IF OBJECT_ID(N'dbo.Appointments', N'U') IS NULL
CREATE TABLE dbo.Appointments (
    AppointmentId   INT IDENTITY(1000,1) NOT NULL CONSTRAINT PK_Appointments PRIMARY KEY,
    BookingType     VARCHAR(10)   NOT NULL CONSTRAINT CK_Appointments_Type CHECK (BookingType IN ('REGULAR', 'FUTURE')),
    Source          VARCHAR(10)   NOT NULL CONSTRAINT DF_Appointments_Source DEFAULT ('APP')
                                  CONSTRAINT CK_Appointments_Source CHECK (Source IN ('APP', 'ADMIN', 'WALKIN', 'PHONE')),
    CustomerId      INT           NOT NULL CONSTRAINT FK_Appointments_Customers REFERENCES dbo.Customers (CustomerId),
    VehicleId       INT           NULL CONSTRAINT FK_Appointments_Vehicles REFERENCES dbo.Vehicles (VehicleId),
    PlateNumber     VARCHAR(15)   NULL,
    VehicleTypeCode VARCHAR(20)   NOT NULL CONSTRAINT FK_Appointments_VehicleTypes REFERENCES dbo.VehicleTypes (Code),
    ServiceCode     VARCHAR(20)   NOT NULL CONSTRAINT FK_Appointments_ServiceTypes REFERENCES dbo.ServiceTypes (Code),
    ScheduledDate   DATE          NOT NULL,
    StartTime       TIME(0)       NOT NULL,
    DurationMinutes INT           NOT NULL,
    Price           DECIMAL(10,2) NOT NULL,
    DiscountAmount  DECIMAL(10,2) NOT NULL CONSTRAINT DF_Appointments_Discount DEFAULT (0),
    DepositAmount   DECIMAL(10,2) NOT NULL CONSTRAINT DF_Appointments_Deposit DEFAULT (0),
    DepositStatus   VARCHAR(10)   NOT NULL CONSTRAINT DF_Appointments_DepositStatus DEFAULT ('NONE')
                                  CONSTRAINT CK_Appointments_DepositStatus CHECK (DepositStatus IN ('NONE', 'PENDING', 'PAID', 'APPLIED', 'REFUNDED', 'FORFEITED')),
    Status          VARCHAR(20)   NOT NULL
                                  CONSTRAINT CK_Appointments_Status CHECK (Status IN ('PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
    AmountPaid      DECIMAL(10,2) NOT NULL CONSTRAINT DF_Appointments_AmountPaid DEFAULT (0),
    PaymentMethod   VARCHAR(20)   NULL, /* CASH | CARD | BIT | APP */
    CustomerNotes   NVARCHAR(300) NULL,
    AdminNotes      NVARCHAR(300) NULL,
    CancelReason    NVARCHAR(200) NULL,
    CancelledBy     VARCHAR(10)   NULL, /* CUSTOMER | ADMIN | SYSTEM */
    IsFreeLoyalty   BIT           NOT NULL CONSTRAINT DF_Appointments_Free DEFAULT (0),
    CreatedAt       DATETIME      NOT NULL CONSTRAINT DF_Appointments_Created DEFAULT (GETDATE()),
    UpdatedAt       DATETIME      NOT NULL CONSTRAINT DF_Appointments_Updated DEFAULT (GETDATE()),
    StartedAt       DATETIME      NULL,
    CompletedAt     DATETIME      NULL,
    CancelledAt     DATETIME      NULL,
    ReminderSentAt  DATETIME      NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Appointments_Date')
    CREATE INDEX IX_Appointments_Date ON dbo.Appointments (ScheduledDate, StartTime) INCLUDE (Status, DurationMinutes);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Appointments_Customer')
    CREATE INDEX IX_Appointments_Customer ON dbo.Appointments (CustomerId, ScheduledDate DESC);
GO

IF OBJECT_ID(N'dbo.AppointmentStatusLog', N'U') IS NULL
CREATE TABLE dbo.AppointmentStatusLog (
    LogId         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AppointmentStatusLog PRIMARY KEY,
    AppointmentId INT          NOT NULL CONSTRAINT FK_StatusLog_Appointments REFERENCES dbo.Appointments (AppointmentId),
    OldStatus     VARCHAR(20)  NULL,
    NewStatus     VARCHAR(20)  NOT NULL,
    ChangedBy     VARCHAR(50)  NULL,
    ChangedAt     DATETIME     NOT NULL CONSTRAINT DF_StatusLog_Changed DEFAULT (GETDATE())
);
GO

IF OBJECT_ID(N'dbo.Payments', N'U') IS NULL
CREATE TABLE dbo.Payments (
    PaymentId     INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Payments PRIMARY KEY,
    AppointmentId INT           NOT NULL CONSTRAINT FK_Payments_Appointments REFERENCES dbo.Appointments (AppointmentId),
    Kind          VARCHAR(10)   NOT NULL CONSTRAINT CK_Payments_Kind CHECK (Kind IN ('DEPOSIT', 'BALANCE', 'REFUND')),
    Amount        DECIMAL(10,2) NOT NULL,
    Provider      VARCHAR(20)   NOT NULL, /* MOCK | CARDCOM | TRANZILA | CASH ... */
    ProviderRef   VARCHAR(100)  NULL,
    Status        VARCHAR(10)   NOT NULL CONSTRAINT CK_Payments_Status CHECK (Status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    CreatedAt     DATETIME      NOT NULL CONSTRAINT DF_Payments_Created DEFAULT (GETDATE()),
    CompletedAt   DATETIME      NULL
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Payments_Appointment')
    CREATE INDEX IX_Payments_Appointment ON dbo.Payments (AppointmentId);
GO

IF OBJECT_ID(N'dbo.Reviews', N'U') IS NULL
CREATE TABLE dbo.Reviews (
    ReviewId      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Reviews PRIMARY KEY,
    AppointmentId INT           NOT NULL CONSTRAINT UQ_Reviews_Appointment UNIQUE
                                CONSTRAINT FK_Reviews_Appointments REFERENCES dbo.Appointments (AppointmentId),
    CustomerId    INT           NOT NULL CONSTRAINT FK_Reviews_Customers REFERENCES dbo.Customers (CustomerId),
    Rating        TINYINT       NOT NULL CONSTRAINT CK_Reviews_Rating CHECK (Rating BETWEEN 1 AND 5),
    Comment       NVARCHAR(500) NULL,
    CreatedAt     DATETIME      NOT NULL CONSTRAINT DF_Reviews_Created DEFAULT (GETDATE())
);
GO
