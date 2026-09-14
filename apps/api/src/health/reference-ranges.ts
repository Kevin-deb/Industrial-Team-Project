import type { HealthMetric, ReferenceRange } from '@doctor/contracts';

export interface ReferenceRangeProvider {
  find(
    metric: HealthMetric,
    age: number,
    unit: string,
    measuredAt?: string,
  ): ReferenceRange | undefined;
}

export class ConfiguredReferenceRangeProvider implements ReferenceRangeProvider {
  constructor(private readonly ranges: readonly ReferenceRange[]) {}

  find(metric: HealthMetric, age: number, unit: string): ReferenceRange | undefined {
    return this.ranges.find(
      (range) =>
        range.metric === metric &&
        range.unit === unit &&
        age >= range.ageMin &&
        age <= range.ageMax,
    );
  }
}

const shared = {
  sourceName: 'CareLink 演示参考配置（非临床指南）',
  version: 'demo-2026.09',
  updatedAt: '2026-09-01T00:00:00+08:00',
  level: 'demo' as const,
};

export const demoReferenceRanges: readonly ReferenceRange[] = [
  { metric: 'systolic', lower: 90, upper: 129, unit: 'mmHg', ageMin: 18, ageMax: 64, ...shared },
  { metric: 'systolic', lower: 90, upper: 139, unit: 'mmHg', ageMin: 65, ageMax: 79, ...shared },
  { metric: 'systolic', lower: 90, upper: 149, unit: 'mmHg', ageMin: 80, ageMax: 120, ...shared },
  { metric: 'diastolic', lower: 60, upper: 84, unit: 'mmHg', ageMin: 18, ageMax: 64, ...shared },
  { metric: 'diastolic', lower: 60, upper: 89, unit: 'mmHg', ageMin: 65, ageMax: 79, ...shared },
  { metric: 'diastolic', lower: 60, upper: 89, unit: 'mmHg', ageMin: 80, ageMax: 120, ...shared },
  { metric: 'glucose', lower: 3.9, upper: 7.8, unit: 'mmol/L', ageMin: 18, ageMax: 120, ...shared },
  { metric: 'heart-rate', lower: 60, upper: 100, unit: 'bpm', ageMin: 18, ageMax: 64, ...shared },
  { metric: 'heart-rate', lower: 55, upper: 95, unit: 'bpm', ageMin: 65, ageMax: 79, ...shared },
  { metric: 'heart-rate', lower: 55, upper: 95, unit: 'bpm', ageMin: 80, ageMax: 120, ...shared },
];

export const demoReferenceRangeProvider = new ConfiguredReferenceRangeProvider(demoReferenceRanges);
