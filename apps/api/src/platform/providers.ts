import type {
  IdentityProvider,
  RtcProvider,
  RecordingProvider,
  NotificationProvider,
  ObjectStorageProvider,
  HospitalProvider,
  DeviceProvider,
} from '@doctor/contracts';

/** Dependency injection boundary. Adapters must be explicitly configured in a future live mode. */
export interface ExternalProviders {
  identity?: IdentityProvider;
  rtc?: RtcProvider;
  recording?: RecordingProvider;
  notifications?: NotificationProvider;
  objectStorage?: ObjectStorageProvider;
  hospital?: HospitalProvider;
  devices?: DeviceProvider;
}
export const demoProviders: Readonly<ExternalProviders> = Object.freeze({});
