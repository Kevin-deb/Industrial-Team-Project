/** Platform-owned settings. The authenticated identity is never supplied by the client. */
export interface UpdateDoctorProfileInput {
  phone: string;
  specialty: string;
  outpatientLocation: string;
  bio: string;
}

export interface DoctorProfile extends UpdateDoctorProfileInput {
  identityId: string;
  /** Verified sign-in address; profile edits cannot change it. */
  email: string;
  emailVerifiedAt: string | null;
  updatedAt: string;
}

export interface DoctorNotificationPreferences {
  encounter: boolean;
  followUp: boolean;
  browser: boolean;
  quietHours: boolean;
  /** 24-hour clock in Asia/Shanghai. Equal start and end means all-day quiet hours. */
  quietStart: string;
  quietEnd: string;
}

export const DEFAULT_DOCTOR_NOTIFICATION_PREFERENCES: Readonly<DoctorNotificationPreferences> =
  Object.freeze({
    encounter: true,
    followUp: true,
    browser: false,
    quietHours: true,
    quietStart: '21:00',
    quietEnd: '08:00',
  });
