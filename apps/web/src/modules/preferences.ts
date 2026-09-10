import { useEffect, useState } from 'react';

export const COMMUNITY_STORAGE_KEY = 'carelink-community-enabled';
export const PREFERENCES_EVENT = 'carelink-preferences-changed';
export function getCommunityEnabled() {
  try {
    return localStorage.getItem(COMMUNITY_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function useCommunityPreference() {
  const [enabled, setEnabled] = useState(getCommunityEnabled);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setEnabled(getCommunityEnabled());
    window.addEventListener(PREFERENCES_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(PREFERENCES_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  function toggle() {
    try {
      localStorage.setItem(COMMUNITY_STORAGE_KEY, String(!enabled));
      setEnabled(!enabled);
      setSaveError(null);
      window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT));
    } catch {
      setSaveError('浏览器未允许保存偏好，请检查本地存储设置。');
    }
  }
  return { enabled, toggle, saveError };
}
