import { useMemo } from 'react';
import { localizeDemoData, useI18n } from '../../shared/i18n';

/**
 * Localize only recognized synthetic fixture text at render time.
 * Keeping localization outside the query cache lets a language switch update
 * immediately without refetching or modifying user-authored records.
 */
export function useLocalizedEData<T>(data: T): T {
  const { language } = useI18n();
  return useMemo(() => localizeDemoData(data, language), [data, language]);
}

/** Preserve the complete TanStack query result while presenting localized demo records. */
export function useLocalizedEQuery<T extends { data: unknown }>(query: T): T {
  const data = useLocalizedEData(query.data);
  return { ...query, data } as T;
}
