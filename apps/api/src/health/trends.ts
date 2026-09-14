import type {
  Observation,
  ObservationTrendPoint,
  ObservationTrendSeries,
  ReferenceRange,
} from '@doctor/contracts';

export function calculateTrendSeries(
  observations: readonly Observation[],
  referenceRange?: ReferenceRange,
  maxPoints = 120,
): ObservationTrendSeries {
  const ordered = [...observations].sort(
    (left, right) =>
      Date.parse(left.measuredAt) - Date.parse(right.measuredAt) || left.id.localeCompare(right.id),
  );
  const first = ordered[0];
  const unit = first?.unit ?? referenceRange?.unit ?? '';
  const metric = first?.metric ?? referenceRange?.metric ?? 'systolic';
  const values = ordered.map((item) => item.value);
  const stats = values.length
    ? {
        latest: values.at(-1)!,
        average: round(values.reduce((sum, value) => sum + value, 0) / values.length),
        minimum: Math.min(...values),
        maximum: Math.max(...values),
        change: round(values.at(-1)! - values[0]!),
        count: values.length,
      }
    : undefined;

  return {
    metric,
    unit,
    points: selectPoints(ordered, Math.max(2, maxPoints)).map(toPoint),
    ...(stats ? { stats } : {}),
    ...(referenceRange && referenceRange.unit === unit ? { referenceRange } : {}),
  };
}

function selectPoints(observations: Observation[], maxPoints: number): Observation[] {
  if (observations.length <= maxPoints) return observations;
  const required = new Set<number>([0, observations.length - 1]);
  let minimumIndex = 0;
  let maximumIndex = 0;
  for (let index = 1; index < observations.length; index += 1) {
    if (observations[index]!.value < observations[minimumIndex]!.value) minimumIndex = index;
    if (observations[index]!.value > observations[maximumIndex]!.value) maximumIndex = index;
  }
  required.add(minimumIndex);
  required.add(maximumIndex);
  const interval = (observations.length - 1) / (maxPoints - 1);
  for (let slot = 0; slot < maxPoints && required.size < maxPoints; slot += 1) {
    required.add(Math.round(slot * interval));
  }
  if (required.size > maxPoints) {
    for (const index of [...required].sort((left, right) => right - left)) {
      if (required.size <= maxPoints) break;
      if (
        index !== 0 &&
        index !== observations.length - 1 &&
        index !== minimumIndex &&
        index !== maximumIndex
      ) {
        required.delete(index);
      }
    }
  }
  return [...required]
    .sort((left, right) => left - right)
    .slice(0, maxPoints)
    .map((index) => observations[index]!);
}

function toPoint(observation: Observation): ObservationTrendPoint {
  return {
    id: observation.id,
    value: observation.value,
    measuredAt: observation.measuredAt,
    receivedAt: observation.receivedAt,
    sourceLabel: observation.sourceLabel,
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
