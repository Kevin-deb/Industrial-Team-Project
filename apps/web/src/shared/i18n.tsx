import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { shellMessages } from './messages';
import { demoMessages } from './demo-messages';
import { moduleMessages } from '../modules/messages';

export type Language = 'zh-CN' | 'en';
type Values = Record<string, string | number>;
const messages: Record<string, string> = { ...demoMessages, ...shellMessages, ...moduleMessages };
const storageKey = 'carelink-language';
export function translate(source: string, language: Language, values: Values = {}): string {
  const message = language === 'en' ? (messages[source] ?? source) : source;
  return message.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

const stableFields = new Set([
  'id',
  'patientId',
  'assignedDoctorId',
  'actorId',
  'targetId',
  'status',
  'type',
  'metric',
  'gender',
  'source',
  'domain',
  'mode',
  'outcome',
  'action',
  'targetType',
  'iteration',
  'version',
  'phone',
]);
/** Only the known synthetic fixture vocabulary is localized. IDs and domain enums never change. */
export function localizeDemoData<T>(data: T, language: Language): T {
  if (language === 'zh-CN' || data == null) return data;
  function visit(value: unknown, key = ''): unknown {
    if (stableFields.has(key)) return value;
    if (typeof value === 'string') return demoMessages[value] ?? value;
    if (Array.isArray(value)) return value.map((item) => visit(item));
    if (typeof value === 'object' && value !== null)
      return Object.fromEntries(
        Object.entries(value).map(([field, item]) => [field, visit(item, field)]),
      );
    return value;
  }
  return visit(data) as T;
}

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (source: string, values?: Values) => string;
  formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string;
}
const I18nContext = createContext<I18nContextValue | null>(null);
function savedLanguage(): Language {
  try {
    return localStorage.getItem(storageKey) === 'en' ? 'en' : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>(savedLanguage);
  const setLanguage = useCallback((next: Language) => {
    if (next !== 'en' && next !== 'zh-CN') return;
    updateLanguage(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      /* The current session still works when storage is unavailable. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === 'en' ? 'CareLink Doctor' : 'CareLink 医生客户端';
  }, [language]);
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: (source, values) => translate(source, language, values),
      formatDate: (input, options = { year: 'numeric', month: 'short', day: 'numeric' }) => {
        const date = new Date(input.length === 10 ? `${input}T12:00:00+08:00` : input);
        if (Number.isNaN(date.valueOf())) return input;
        return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'zh-CN', {
          timeZone: 'Asia/Shanghai',
          ...options,
        }).format(date);
      },
    }),
    [language, setLanguage],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
