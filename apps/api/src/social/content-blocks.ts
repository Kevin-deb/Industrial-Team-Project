import type { CreateSocialContentBlockInput, MedicalMetricCard } from '@doctor/contracts';
import { SocialValidationFailure } from './service.js';

const metricUnits: Record<string, string> = {
  systolic: 'mmHg',
  diastolic: 'mmHg',
  'heart-rate': 'bpm',
  glucose: 'mmol/L',
};

export function validateContentBlocks(
  value: CreateSocialContentBlockInput[] | undefined,
): CreateSocialContentBlockInput[] {
  const blocks = value ?? [];
  if (blocks.length > 7) throw new SocialValidationFailure();
  const imageCount = blocks.filter((item) => item.kind === 'image').length;
  const audioCount = blocks.filter((item) => item.kind === 'audio').length;
  const cardCount = blocks.filter((item) => item.kind === 'medical-metric-card').length;
  if (imageCount > 4 || audioCount > 1 || cardCount > 2) throw new SocialValidationFailure();
  const attachmentIds = new Set<string>();
  for (const [index, block] of blocks.entries()) {
    if (block.order !== index) throw new SocialValidationFailure();
    if (block.kind === 'medical-metric-card') validateCard(block.card);
    else {
      if (!block.attachmentId || attachmentIds.has(block.attachmentId))
        throw new SocialValidationFailure();
      attachmentIds.add(block.attachmentId);
    }
  }
  return blocks;
}

function validateCard(card: MedicalMetricCard) {
  if (
    card.schemaVersion !== 1 ||
    card.sourceType !== 'manual' ||
    !card.deidentificationConfirmed ||
    !isRfc3339(card.measuredAt) ||
    !card.sourceLabel.trim() ||
    card.sourceLabel.length > 100 ||
    (card.note?.length ?? 0) > 300 ||
    card.metrics.length < 1 ||
    card.metrics.length > 4
  )
    throw new SocialValidationFailure();
  const seen = new Set<string>();
  for (const metric of card.metrics) {
    if (
      !Object.hasOwn(metricUnits, metric.metricCode) ||
      metricUnits[metric.metricCode] !== metric.unit ||
      !metric.displayName.trim() ||
      metric.displayName.length > 30 ||
      !Number.isFinite(metric.value) ||
      seen.has(metric.metricCode)
    )
      throw new SocialValidationFailure();
    seen.add(metric.metricCode);
  }
}

function isRfc3339(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
