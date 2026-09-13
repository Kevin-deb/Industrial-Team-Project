import { useEffect } from 'react';
import { useSocialPreferences, useUpdateSocialPreferences } from './community/queries';

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
  const preferences = useSocialPreferences();
  const update = useUpdateSocialPreferences();
  const enabled = preferences.data?.data.enabled ?? getCommunityEnabled();
  useEffect(() => {
    if (!preferences.data) return;
    try {
      localStorage.setItem(COMMUNITY_STORAGE_KEY, String(preferences.data.data.enabled));
      window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT));
    } catch { /* The server remains the source of truth. */ }
  }, [preferences.data]);
  function toggle() {
    update.mutate({ enabled: !enabled, notificationsEnabled: !enabled });
  }
  return { enabled, toggle, saveError: update.error?.message ?? preferences.error?.message ?? null };
}
