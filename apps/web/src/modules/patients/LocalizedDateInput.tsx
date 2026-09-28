import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../shared/i18n';

type DateParts = { year: string; month: string; day: string };

function partsFrom(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? { year: match[1], month: match[2], day: match[3] }
    : { year: '', month: '', day: '' };
}

export function LocalizedDateInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { language, t } = useI18n();
  const [parts, setParts] = useState(() => partsFrom(value));
  useEffect(() => setParts(partsFrom(value)), [value]);
  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () =>
      Array.from({ length: currentYear - 1919 + 10 }, (_, index) =>
        String(currentYear + 10 - index),
      ),
    [currentYear],
  );
  const daysInMonth =
    parts.year && parts.month ? new Date(Number(parts.year), Number(parts.month), 0).getDate() : 31;
  const update = (key: keyof DateParts, nextValue: string) => {
    const next = { ...parts, [key]: nextValue };
    const nextDaysInMonth =
      next.year && next.month ? new Date(Number(next.year), Number(next.month), 0).getDate() : 31;
    if (key !== 'day' && next.day && Number(next.day) > nextDaysInMonth) next.day = '';
    setParts(next);
    onChange(next.year && next.month && next.day ? `${next.year}-${next.month}-${next.day}` : '');
  };
  const fields = {
    year: (
      <select
        aria-label={`${label}: ${t('年')}`}
        value={parts.year}
        onChange={(event) => update('year', event.target.value)}
      >
        <option value="">{t('年')}</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    ),
    month: (
      <select
        aria-label={`${label}: ${t('月')}`}
        value={parts.month}
        onChange={(event) => update('month', event.target.value)}
      >
        <option value="">{t('月')}</option>
        {Array.from({ length: 12 }, (_, index) => {
          const month = String(index + 1).padStart(2, '0');
          const text =
            language === 'en'
              ? new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(
                  new Date(Date.UTC(2020, index, 1)),
                )
              : `${index + 1}月`;
          return (
            <option key={month} value={month}>
              {text}
            </option>
          );
        })}
      </select>
    ),
    day: (
      <select
        aria-label={`${label}: ${t('日')}`}
        value={parts.day}
        onChange={(event) => update('day', event.target.value)}
      >
        <option value="">{t('日')}</option>
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = String(index + 1).padStart(2, '0');
          return (
            <option key={day} value={day}>
              {index + 1}
            </option>
          );
        })}
      </select>
    ),
  };
  const order: (keyof DateParts)[] =
    language === 'en' ? ['day', 'month', 'year'] : ['year', 'month', 'day'];
  return (
    <div className="patients-date-input" role="group" aria-label={label}>
      {order.map((key) => (
        <span key={key}>{fields[key]}</span>
      ))}
    </div>
  );
}
