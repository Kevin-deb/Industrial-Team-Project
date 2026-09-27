import { useEffect, useState } from 'react';
import type { SocialContentBlock } from '@doctor/contracts';
import { sessionToken } from '../../shared/api';

function useProtectedMedia(contentUrl: string, mediaType: string) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setSource(null);
    setFailed(false);

    const token = sessionToken();
    fetch(contentUrl, {
      signal: controller.signal,
      headers: {
        Accept: mediaType,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Attachment request failed (${response.status})`);
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [contentUrl, mediaType]);

  return { source, failed };
}

function ProtectedImage({ contentUrl, mediaType }: { contentUrl: string; mediaType: string }) {
  const { source, failed } = useProtectedMedia(contentUrl, mediaType);
  if (failed) return <span className="community-attachment-error" role="alert" />;
  if (!source) return <span className="community-attachment-loading" aria-busy="true" />;
  return <img src={source} alt="帖子附件" loading="lazy" />;
}

function ProtectedAudio({ contentUrl, mediaType }: { contentUrl: string; mediaType: string }) {
  const { source, failed } = useProtectedMedia(contentUrl, mediaType);
  return (
    <audio
      data-testid="social-audio-attachment"
      controls
      preload="metadata"
      src={source ?? undefined}
      aria-busy={!source && !failed}
      aria-invalid={failed || undefined}
    />
  );
}

export function ContentBlocks({ blocks }: { blocks: readonly SocialContentBlock[] }) {
  if (!blocks.length) return null;
  return (
    <div className="community-content-blocks">
      {[...blocks]
        .sort((left, right) => left.order - right.order)
        .map((block) => {
          if (block.kind === 'image')
            return (
              <ProtectedImage
                key={block.id}
                contentUrl={block.attachment.contentUrl}
                mediaType={block.attachment.mediaType}
              />
            );
          if (block.kind === 'audio')
            return (
              <ProtectedAudio
                key={block.id}
                contentUrl={block.attachment.contentUrl}
                mediaType={block.attachment.mediaType}
              />
            );
          return (
            <section key={block.id} className="community-medical-card">
              <header>
                <strong>去标识化测量</strong>
                <time>{new Date(block.card.measuredAt).toLocaleString()}</time>
              </header>
              <div>
                {block.card.metrics.map((metric) => (
                  <span key={metric.metricCode}>
                    <b>{metric.value}</b> {metric.unit}
                    <small>{metric.displayName}</small>
                  </span>
                ))}
              </div>
              <footer>
                来源：{block.card.sourceLabel}
                {block.card.note ? ` · ${block.card.note}` : ''}
              </footer>
            </section>
          );
        })}
    </div>
  );
}
