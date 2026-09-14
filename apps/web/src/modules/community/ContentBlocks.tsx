import type { SocialContentBlock } from '@doctor/contracts';

export function ContentBlocks({ blocks }: { blocks: readonly SocialContentBlock[] }) {
  if (!blocks.length) return null;
  return (
    <div className="community-content-blocks">
      {[...blocks]
        .sort((left, right) => left.order - right.order)
        .map((block) => {
          if (block.kind === 'image')
            return (
              <img key={block.id} src={block.attachment.contentUrl} alt="帖子附件" loading="lazy" />
            );
          if (block.kind === 'audio')
            return (
              <audio key={block.id} controls preload="metadata" src={block.attachment.contentUrl} />
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
