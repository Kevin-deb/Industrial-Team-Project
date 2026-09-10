import type { Observation } from './health.js';

export interface IdentityProvider {
  verifyIdentity(input: {
    method: 'email' | 'sms' | 'face';
    challengeId: string;
    response: string;
  }): Promise<{ subjectId: string }>;
}

export interface RtcProvider {
  createRoom(input: {
    encounterId: string;
    participantIds: string[];
  }): Promise<{ roomId: string; expiresAt: string }>;
  closeRoom(roomId: string): Promise<void>;
}

export interface RecordingProvider {
  start(input: { roomId: string; consentReference: string }): Promise<{ recordingId: string }>;
  stop(recordingId: string): Promise<void>;
}

export interface NotificationProvider {
  send(input: {
    recipientId: string;
    templateId: string;
    parameters: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string }>;
}

export interface ObjectStorageProvider {
  createUpload(input: {
    ownerId: string;
    contentType: string;
    byteLength: number;
  }): Promise<{ objectKey: string; uploadUrl: string; expiresAt: string }>;
  createDownload(objectKey: string): Promise<{ url: string; expiresAt: string }>;
}

export interface HospitalProvider {
  importRecord(input: {
    externalPatientId: string;
    authorizationReference: string;
  }): Promise<{ sourceId: string; recordVersion: string }>;
}

export interface DeviceProvider {
  readObservations(input: {
    externalPatientId: string;
    since: string;
    authorizationReference: string;
  }): Promise<Observation[]>;
}
