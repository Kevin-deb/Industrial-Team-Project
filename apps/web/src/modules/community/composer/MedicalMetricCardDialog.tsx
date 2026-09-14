import { Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { MedicalMetricCard } from '@doctor/contracts';
import { Button } from '../../../shared/ui';

const metrics = {
  systolic: { name: '收缩压', unit: 'mmHg' },
  diastolic: { name: '舒张压', unit: 'mmHg' },
  'heart-rate': { name: '心率', unit: 'bpm' },
  glucose: { name: '血糖', unit: 'mmol/L' },
} as const;
type MetricCode = keyof typeof metrics;
type Row = { id: string; code: MetricCode; value: string };

export function MedicalMetricCardDialog({
  onAdd,
  onClose,
}: {
  onAdd: (card: MedicalMetricCard) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([
    { id: crypto.randomUUID(), code: 'systolic', value: '' },
    { id: crypto.randomUUID(), code: 'diastolic', value: '' },
  ]);
  const [measuredAt, setMeasuredAt] = useState(new Date().toISOString().slice(0, 16));
  const [sourceLabel, setSourceLabel] = useState('手工录入');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const used = new Set(rows.map((row) => row.code));
    const values = rows.map((row) => Number(row.value));
    if (
      used.size !== rows.length ||
      values.some((value) => !Number.isFinite(value)) ||
      !sourceLabel.trim() ||
      !confirmed
    ) {
      setError('请填写有效数值、避免重复指标，并确认已去除身份信息。');
      return;
    }
    onAdd({
      schemaVersion: 1,
      sourceType: 'manual',
      measuredAt: new Date(measuredAt).toISOString(),
      metrics: rows.map((row, index) => ({
        metricCode: row.code,
        displayName: metrics[row.code].name,
        value: values[index]!,
        unit: metrics[row.code].unit,
      })),
      sourceLabel: sourceLabel.trim(),
      ...(note.trim() ? { note: note.trim() } : {}),
      deidentificationConfirmed: true,
    });
  }

  return (
    <div className="community-dialog-backdrop community-subdialog">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="添加医学数据"
        className="community-dialog community-metric-dialog"
      >
        <header>
          <div>
            <h2>添加医学数据</h2>
            <small>仅分享一次去标识化测量，不关联患者档案</small>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            测量时间
            <input
              type="datetime-local"
              required
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
            />
          </label>
          <div className="community-metric-rows">
            {rows.map((row) => (
              <div key={row.id}>
                <select
                  aria-label="指标"
                  value={row.code}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id
                          ? { ...item, code: event.target.value as MetricCode }
                          : item,
                      ),
                    )
                  }
                >
                  {Object.entries(metrics).map(([code, item]) => (
                    <option key={code} value={code}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`${metrics[row.code].name}数值`}
                  type="number"
                  step="any"
                  required
                  value={row.value}
                  onChange={(event) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                />
                <span>{metrics[row.code].unit}</span>
                <button
                  type="button"
                  aria-label={`删除${metrics[row.code].name}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={rows.length >= 4}
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    id: crypto.randomUUID(),
                    code:
                      (Object.keys(metrics) as MetricCode[]).find(
                        (code) => !current.some((row) => row.code === code),
                      ) ?? 'heart-rate',
                    value: '',
                  },
                ])
              }
            >
              <Plus size={14} /> 添加指标
            </button>
          </div>
          <label>
            数据来源
            <input
              required
              maxLength={100}
              value={sourceLabel}
              onChange={(event) => setSourceLabel(event.target.value)}
            />
          </label>
          <label>
            备注（可选）
            <textarea
              maxLength={300}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <label className="community-check community-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            我确认内容中没有姓名、患者编号、联系方式或就诊编号
          </label>
          {error && (
            <p className="community-error" role="alert">
              {error}
            </p>
          )}
          <footer>
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button type="submit">添加到内容</Button>
          </footer>
        </form>
      </section>
    </div>
  );
}
