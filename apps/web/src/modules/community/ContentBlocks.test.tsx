import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SocialContentBlock } from '@doctor/contracts';
import { ContentBlocks } from './ContentBlocks';

const audioBlock: SocialContentBlock = {
  id: 'BLOCK-1',
  kind: 'audio',
  order: 0,
  attachment: {
    id: 'ATTACHMENT-1',
    kind: 'audio',
    mediaType: 'audio/webm',
    byteSize: 3,
    durationMs: 1_000,
    contentUrl: '/api/v1/social/attachments/ATTACHMENT-1/content',
  },
};

describe('ContentBlocks protected attachments', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('loads audio with the active session token before exposing it to the media element', async () => {
    localStorage.setItem('carelink-session-token', 'session-test');
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'audio/webm' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn(() => 'blob:carelink-audio');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    const view = render(<ContentBlocks blocks={[audioBlock]} />);

    await waitFor(() =>
      expect(screen.getByTestId('social-audio-attachment')).toHaveAttribute(
        'src',
        'blob:carelink-audio',
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      audioBlock.attachment.contentUrl,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-test' }),
      }),
    );

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:carelink-audio');
  });
});
