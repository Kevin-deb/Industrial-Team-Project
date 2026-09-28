export const settingsMigration = {
  version: 33,
  name: 'platform_doctor_profile_and_notification_preferences',
  sql: `
    ALTER TABLE doctors ADD COLUMN outpatient_location TEXT NOT NULL DEFAULT '';
    ALTER TABLE doctors ADD COLUMN bio TEXT NOT NULL DEFAULT '';
    CREATE TABLE doctor_notification_preferences (
      identity_id TEXT PRIMARY KEY REFERENCES doctors(identity_id),
      encounter INTEGER NOT NULL DEFAULT 1 CHECK(encounter IN (0,1)),
      follow_up INTEGER NOT NULL DEFAULT 1 CHECK(follow_up IN (0,1)),
      browser INTEGER NOT NULL DEFAULT 0 CHECK(browser IN (0,1)),
      quiet_hours INTEGER NOT NULL DEFAULT 1 CHECK(quiet_hours IN (0,1)),
      quiet_start TEXT NOT NULL DEFAULT '21:00' CHECK(quiet_start GLOB '[0-2][0-9]:[0-5][0-9]' AND quiet_start < '24:00'),
      quiet_end TEXT NOT NULL DEFAULT '08:00' CHECK(quiet_end GLOB '[0-2][0-9]:[0-5][0-9]' AND quiet_end < '24:00'),
      updated_at TEXT NOT NULL
    );
  `,
};
