/* =====================================================================
   Initial data - safe to run more than once (MERGE is available in 2008)
   The first admin user is created by the API server on first start
   (ADMIN_USERNAME / ADMIN_PASSWORD in server/.env) so no password hash
   is stored in this file.
   ===================================================================== */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
USE CarWash;
GO

MERGE dbo.VehicleTypes AS t
USING (VALUES
    ('PRIVATE', N'רכב פרטי', 'car-side',         1),
    ('JEEP',    N'ג׳יפ',      'car-estate',       2)
) AS s (Code, NameHe, IconName, SortOrder)
ON t.Code = s.Code
WHEN NOT MATCHED THEN
    INSERT (Code, NameHe, IconName, SortOrder, IsActive) VALUES (s.Code, s.NameHe, s.IconName, s.SortOrder, 1);
GO

MERGE dbo.ServiceTypes AS t
USING (VALUES
    ('EXTERIOR', N'שטיפה חיצונית', N'שטיפת מרכב, חישוקים וחלונות מבחוץ, ייבוש במגבות מיקרופייבר', 30, 1),
    ('INTERIOR', N'ניקוי פנימי',    N'שאיבת אבק, ניקוי דשבורד, קונסולה, חלונות מבפנים ושטיחונים', 30, 2),
    ('FULL',     N'פנים + חוץ',     N'החבילה המלאה - שטיפה חיצונית וניקוי פנימי יסודי',           60, 3)
) AS s (Code, NameHe, DescriptionHe, DurationMinutes, SortOrder)
ON t.Code = s.Code
WHEN NOT MATCHED THEN
    INSERT (Code, NameHe, DescriptionHe, DurationMinutes, SortOrder, IsActive)
    VALUES (s.Code, s.NameHe, s.DescriptionHe, s.DurationMinutes, s.SortOrder, 1);
GO

/* current price list (NIS) */
MERGE dbo.Prices AS t
USING (VALUES
    ('PRIVATE', 'EXTERIOR',  50.00),
    ('PRIVATE', 'INTERIOR',  50.00),
    ('PRIVATE', 'FULL',     100.00),
    ('JEEP',    'EXTERIOR',  60.00),
    ('JEEP',    'INTERIOR',  60.00),
    ('JEEP',    'FULL',     120.00)
) AS s (VehicleTypeCode, ServiceCode, Price)
ON t.VehicleTypeCode = s.VehicleTypeCode AND t.ServiceCode = s.ServiceCode
WHEN NOT MATCHED THEN
    INSERT (VehicleTypeCode, ServiceCode, Price) VALUES (s.VehicleTypeCode, s.ServiceCode, s.Price);
GO

/* on/off switch for every system in the app */
MERGE dbo.FeatureFlags AS t
USING (VALUES
    ('BOOKING_SYSTEM',      N'מערכת הזמנת התורים',      N'מתג ראשי - כיבוי עוצר כל הזמנה חדשה באפליקציה',                 N'הזמנות', 1, 1),
    ('REGULAR_BOOKING',     N'תורים רגילים (להיום)',     N'קביעת תור לאותו היום, תשלום במקום',                              N'הזמנות', 1, 2),
    ('FUTURE_BOOKING',      N'תורים עתידיים',            N'קביעת תור לתאריך עתידי',                                         N'הזמנות', 1, 3),
    ('FUTURE_DEPOSIT',      N'מקדמה לתור עתידי',          N'גביית מקדמה בעת קביעת תור עתידי (הסכום נקבע בהגדרות)',            N'תשלומים', 1, 4),
    ('CUSTOMER_CANCEL',     N'ביטול תור ע״י הלקוח',       N'הלקוח יכול לבטל תור בעצמו מתוך האפליקציה',                      N'הזמנות', 1, 5),
    ('NEW_REGISTRATIONS',   N'הרשמת לקוחות חדשים',       N'כיבוי מאפשר כניסה רק ללקוחות קיימים',                            N'לקוחות', 1, 6),
    ('LOYALTY_PROGRAM',     N'כרטיסיית מועדון',           N'כל X שטיפות - שטיפה חיצונית מתנה',                              N'לקוחות', 1, 7),
    ('REVIEWS',             N'דירוג שטיפות',              N'הלקוח יכול לדרג שטיפה שהושלמה',                                  N'לקוחות', 1, 8),
    ('SMS_NOTIFICATIONS',   N'הודעות SMS ותזכורות',       N'אישור הזמנה ותזכורת לפני התור',                                  N'תקשורת', 0, 9),
    ('ANNOUNCEMENT_BANNER', N'הודעה ללקוחות',             N'באנר במסך הבית (הטקסט נקבע בהגדרות)',                            N'תקשורת', 0, 10)
) AS s (FlagKey, NameHe, DescriptionHe, GroupName, IsEnabled, SortOrder)
ON t.FlagKey = s.FlagKey
WHEN NOT MATCHED THEN
    INSERT (FlagKey, NameHe, DescriptionHe, GroupName, IsEnabled, SortOrder)
    VALUES (s.FlagKey, s.NameHe, s.DescriptionHe, s.GroupName, s.IsEnabled, s.SortOrder);
GO

MERGE dbo.Settings AS t
USING (VALUES
    ('BUSINESS_NAME',            N'אקווה שיין'),
    ('BUSINESS_PHONE',           N'050-0000000'),
    ('BUSINESS_ADDRESS',         N'רחוב הדוגמה 1, תל אביב'),
    ('ANNOUNCEMENT_TEXT',        N''),
    ('DEPOSIT_AMOUNT',           N'20'),
    ('SLOT_INTERVAL_MINUTES',    N'30'),
    ('PARALLEL_BAYS',            N'2'),
    ('FUTURE_MAX_DAYS',          N'30'),
    ('REGULAR_MIN_LEAD_MINUTES', N'15'),
    ('CANCEL_FREE_HOURS',        N'24'),
    ('PAYMENT_HOLD_MINUTES',     N'15'),
    ('LOYALTY_PUNCHES_FOR_FREE', N'10')
) AS s (SettingKey, SettingValue)
ON t.SettingKey = s.SettingKey
WHEN NOT MATCHED THEN
    INSERT (SettingKey, SettingValue) VALUES (s.SettingKey, s.SettingValue);
GO

/* Sun-Thu 08:00-19:00, Fri 07:30-14:00, Sat closed */
MERGE dbo.BusinessHours AS t
USING (VALUES
    (0, 1, '08:00', '19:00'),
    (1, 1, '08:00', '19:00'),
    (2, 1, '08:00', '19:00'),
    (3, 1, '08:00', '19:00'),
    (4, 1, '08:00', '19:00'),
    (5, 1, '07:30', '14:00'),
    (6, 0, NULL,    NULL)
) AS s (DayOfWeek, IsOpen, OpenTime, CloseTime)
ON t.DayOfWeek = s.DayOfWeek
WHEN NOT MATCHED THEN
    INSERT (DayOfWeek, IsOpen, OpenTime, CloseTime) VALUES (s.DayOfWeek, s.IsOpen, s.OpenTime, s.CloseTime);
GO
