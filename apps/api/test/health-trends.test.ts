import test from 'node:test';
import assert from 'node:assert/strict';
import type { Observation, ReferenceRange } from '@doctor/contracts';
import { ConfiguredReferenceRangeProvider } from '../src/health/reference-ranges.js';
import { calculateTrendSeries } from '../src/health/trends.js';
import { createApp } from '../src/app.js';

const observation = (id: string, value: number, day: number): Observation => ({
  id,
  patientId: 'PAT-001',
  metric: 'systolic',
  value,
  unit: 'mmHg',
  measuredAt: `2026-09-${String(day).padStart(2, '0')}T08:00:00+08:00`,
  receivedAt: `2026-09-${String(day).padStart(2, '0')}T08:01:00+08:00`,
  source: 'synthetic-demo',
  sourceLabel: '模拟居家设备',
  qualityStatus: 'demo',
});

test('trend calculator derives stable statistics from chronological observations', () => {
  const range: ReferenceRange = {
    metric: 'systolic',
    lower: 90,
    upper: 139,
    unit: 'mmHg',
    ageMin: 65,
    ageMax: 79,
    sourceName: 'CareLink 演示年龄规则',
    version: 'demo-2026.09',
    updatedAt: '2026-09-01T00:00:00+08:00',
    level: 'demo',
  };

  const series = calculateTrendSeries(
    [observation('OBS-3', 118, 3), observation('OBS-1', 120, 1), observation('OBS-2', 126, 2)],
    range,
  );

  assert.equal(series.metric, 'systolic');
  assert.deepEqual(
    series.points.map((point) => point.value),
    [120, 126, 118],
  );
  assert.deepEqual(series.stats, {
    latest: 118,
    average: 121.33,
    minimum: 118,
    maximum: 126,
    change: -2,
    count: 3,
  });
  assert.deepEqual(series.referenceRange, range);
});

test('trend calculator bounds chart points while preserving endpoints and extrema', () => {
  const values = Array.from({ length: 240 }, (_, index) =>
    observation(`OBS-${index}`, index === 113 ? 40 : index === 177 ? 260 : 120 + (index % 7), 1),
  ).map((item, index) => ({
    ...item,
    measuredAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    receivedAt: new Date(Date.UTC(2026, 0, 1, 0, index, 30)).toISOString(),
  }));

  const series = calculateTrendSeries(values, undefined, 120);

  assert.ok(series.points.length <= 120);
  assert.equal(series.points[0]?.id, 'OBS-0');
  assert.equal(series.points.at(-1)?.id, 'OBS-239');
  assert.ok(series.points.some((point) => point.value === 40));
  assert.ok(series.points.some((point) => point.value === 260));
  assert.equal(series.stats?.count, 240);
});

test('reference provider selects exact age and unit rules without guessing', () => {
  const provider = new ConfiguredReferenceRangeProvider([
    {
      metric: 'heart-rate',
      lower: 60,
      upper: 100,
      unit: 'bpm',
      ageMin: 18,
      ageMax: 64,
      sourceName: 'CareLink 演示年龄规则',
      version: 'demo-2026.09',
      updatedAt: '2026-09-01T00:00:00+08:00',
      level: 'demo',
    },
    {
      metric: 'heart-rate',
      lower: 55,
      upper: 95,
      unit: 'bpm',
      ageMin: 65,
      ageMax: 79,
      sourceName: 'CareLink 演示年龄规则',
      version: 'demo-2026.09',
      updatedAt: '2026-09-01T00:00:00+08:00',
      level: 'demo',
    },
  ]);

  assert.deepEqual(provider.find('heart-rate', 64, 'bpm')?.ageMax, 64);
  assert.deepEqual(provider.find('heart-rate', 65, 'bpm')?.ageMin, 65);
  assert.equal(provider.find('heart-rate', 80, 'bpm'), undefined);
  assert.equal(provider.find('heart-rate', 65, 'mmHg'), undefined);
});

test('observation trends endpoint returns complete statistics and age reference metadata', async () => {
  const app = await createApp({ now: () => '2026-09-13T09:15:00+08:00' });
  try {
    const response = await app.inject(
      '/api/v1/health/observation-trends?patientId=PAT-002&from=2026-08-01T00%3A00%3A00%2B08%3A00&to=2026-09-13T23%3A59%3A59%2B08%3A00',
    );

    assert.equal(response.statusCode, 200, response.body);
    const payload = response.json().data;
    assert.equal(payload.patientId, 'PAT-002');
    assert.equal(payload.patientAge, 72);
    assert.equal(payload.series.length, 4);
    const systolic = payload.series.find(
      (series: { metric: string }) => series.metric === 'systolic',
    );
    assert.ok(systolic.points.length > 1);
    assert.ok(systolic.stats.count >= systolic.points.length);
    assert.equal(systolic.referenceRange.ageMin, 65);
    assert.equal(systolic.referenceRange.ageMax, 79);
    assert.equal(systolic.referenceRange.level, 'demo');
    assert.equal(systolic.referenceRange.sourceName, 'CareLink 演示参考配置（非临床指南）');
    const diastolic = payload.series.find(
      (series: { metric: string }) => series.metric === 'diastolic',
    );
    assert.equal(diastolic.points.length, 30);
    assert.equal(diastolic.stats.count, 30);
    assert.equal(diastolic.referenceRange.lower, 60);
    assert.equal(diastolic.referenceRange.upper, 89);
  } finally {
    await app.close();
  }
});

test('observation trends endpoint rejects invalid dates and inaccessible patients', async () => {
  const app = await createApp();
  try {
    assert.equal(
      (
        await app.inject(
          '/api/v1/health/observation-trends?patientId=PAT-001&from=2026-09-13T00%3A00%3A00%2B08%3A00&to=2026-09-01T00%3A00%3A00%2B08%3A00',
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (await app.inject('/api/v1/health/observation-trends?patientId=PAT-RESTRICTED')).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});
