import { randomUUID } from 'node:crypto';
import type { SocialAttachment } from '@doctor/contracts';
import type { RequestContext } from '../platform/index.js';
import {
  extensionForMedia,
  validateMedia,
  type AttachmentStoragePort,
} from './attachment-storage.js';
import { SqliteSocialRepository, type SocialAttachmentRecord } from './repository.js';
import { CommunityDisabled, SocialNotFound, SocialValidationFailure } from './service.js';

export interface ReadAttachment {
  attachment: SocialAttachment;
  content: Buffer;
}

export class AttachmentService {
  constructor(
    private readonly repository: SqliteSocialRepository,
    private readonly storage: AttachmentStoragePort,
  ) {}

  async upload(
    content: Uint8Array,
    claimedMediaType: string,
    context: RequestContext,
  ): Promise<SocialAttachment> {
    this.assertEnabled(context);
    let storageKey: string | undefined;
    try {
      const media = await validateMedia(content, claimedMediaType);
      storageKey = await this.storage.write(content, extensionForMedia(media.mediaType));
      const id = `ATTACHMENT-${randomUUID()}`;
      const item: SocialAttachmentRecord = {
        id,
        ownerIdentityId: context.actorId,
        storageKey,
        state: 'temporary',
        createdAt: context.now,
        contentUrl: `/api/v1/social/attachments/${id}/content`,
        byteSize: content.byteLength,
        ...media,
      };
      this.repository.createAttachment(item);
      return publicAttachment(item);
    } catch (error) {
      if (storageKey) await this.storage.remove(storageKey);
      if (
        error instanceof CommunityDisabled ||
        error instanceof SocialValidationFailure ||
        error instanceof SocialNotFound
      )
        throw error;
      throw new SocialValidationFailure();
    }
  }

  async read(id: string, context: RequestContext): Promise<ReadAttachment> {
    this.assertEnabled(context);
    const item = this.repository.findAttachment(id);
    if (!item || !this.repository.canReadAttachment(id, context.actorId))
      throw new SocialNotFound();
    try {
      return {
        attachment: publicAttachment(item),
        content: await this.storage.read(item.storageKey),
      };
    } catch {
      throw new SocialNotFound();
    }
  }

  async removeTemporary(id: string, context: RequestContext): Promise<{ id: string }> {
    this.assertEnabled(context);
    const item = this.repository.deleteTemporaryAttachment(id, context.actorId);
    if (!item) throw new SocialNotFound();
    await this.storage.remove(item.storageKey);
    return { id };
  }

  private assertEnabled(context: RequestContext) {
    if (!this.repository.getPreferences(context.actorId).enabled) throw new CommunityDisabled();
  }
}

function publicAttachment(item: SocialAttachment): SocialAttachment {
  return {
    id: item.id,
    kind: item.kind,
    mediaType: item.mediaType,
    byteSize: item.byteSize,
    ...(item.width ? { width: item.width } : {}),
    ...(item.height ? { height: item.height } : {}),
    ...(item.durationMs !== undefined ? { durationMs: item.durationMs } : {}),
    contentUrl: item.contentUrl,
  };
}
