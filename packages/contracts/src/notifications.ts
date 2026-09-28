import type { DoctorNotificationPreferences } from './preferences.js';
export interface DemoNotificationReceipt {
  id: string;
  reminderId: string;
  patientId: string;
  channel: 'in-app' | 'sms' | 'email';
  templateId: string;
  body: string;
  deliveredAt: string;
  mode: 'local-test';
}
export interface WorkspaceNotifications {
  preferences: DoctorNotificationPreferences;
  quietNow: boolean;
  encounters: Array<{ id: string; patientId: string; patientName: string; scheduledAt: string }>;
  reminders: DemoNotificationReceipt[];
  inbox: DemoNotificationReceipt[];
}
