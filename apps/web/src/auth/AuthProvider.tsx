import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DoctorSession } from '@doctor/contracts';
import { requestApi, setSessionToken, sessionToken } from '../shared/api';
import { LoginPage } from './LoginPage';

type BeginResult = { challengeId: string; emailHint: string; expiresAt: string; demoCode?: string };
type VerifyResult = { photoTicket: string; expiresAt: string; demoOnly: true };
type PasswordChallenge = { challengeId: string; method: 'email' | 'photo'; emailHint: string; demoCode?: string };

interface AuthContextValue {
  session: DoctorSession;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DoctorSession | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setSessionToken(null);
    setSession(null);
    void window.carelinkRealtime?.setSessionToken?.(null);
  }, []);

  const loadSession = useCallback(async () => {
    if (!sessionToken()) {
      setLoading(false);
      return;
    }
    try {
      const response = await requestApi<DoctorSession>('/session');
      setSession(response.data);
      await window.carelinkRealtime?.setSessionToken?.(sessionToken());
    } catch {
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    void loadSession();
    const expired = () => clearSession();
    window.addEventListener('carelink:auth-required', expired);
    return () => window.removeEventListener('carelink:auth-required', expired);
  }, [clearSession, loadSession]);

  const beginLogin = useCallback(async (input: { account: string; password: string }) => {
    const started = await requestApi<BeginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    try {
      const demo = await requestApi<{ code: string }>(
        '/auth/demo-email/' + encodeURIComponent(started.data.challengeId),
      );
      return { ...started.data, demoCode: demo.data.code };
    } catch {
      return started.data;
    }
  }, []);

  const verifyEmail = useCallback(async (input: { challengeId: string; code: string }) => {
    return (
      await requestApi<VerifyResult>('/auth/email/verify', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    ).data;
  }, []);

  const beginPhotoLogin = useCallback(async (input: { account: string }) => {
    return (
      await requestApi<{ photoTicket: string; expiresAt: string; demoOnly: true }>('/auth/photo-login/start', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    ).data;
  }, []);

  const beginRecovery = useCallback(async (input: { account: string; method: 'email' | 'photo' }) => {
    const started = await requestApi<PasswordChallenge>('/auth/password/recover-password/start', {
      method: 'POST', body: JSON.stringify(input),
    });
    if (input.method === 'email') {
      try {
        const demo = await requestApi<{ code: string }>('/auth/demo-email/' + encodeURIComponent(started.data.challengeId));
        return { ...started.data, demoCode: demo.data.code };
      } catch { /* SMTP delivery has no local code. */ }
    }
    return started.data;
  }, []);

  const completeRecovery = useCallback(async (input: { challengeId: string; code?: string; photoDataUrl?: string; newPassword: string }) => {
    await requestApi('/auth/password/recover-password/complete', { method: 'POST', body: JSON.stringify(input) });
  }, []);

  const completePhotoCheck = useCallback(
    async (input: { ticket: string; captureMethod: 'camera' | 'upload'; photoDataUrl: string }) => {
      const completed = await requestApi<{ token: string }>('/auth/photo-check', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setSessionToken(completed.data.token);
      await window.carelinkRealtime?.setSessionToken?.(completed.data.token);
      const current = await requestApi<DoctorSession>('/session');
      setSession(current.data);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await requestApi('/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => (session ? { session, logout } : null), [logout, session]);
  if (loading) return <div className="auth-loading">CareLink</div>;
  if (!value)
    return (
      <LoginPage
        beginLogin={beginLogin}
        beginPhotoLogin={beginPhotoLogin}
        verifyEmail={verifyEmail}
        completePhotoCheck={completePhotoCheck}
        beginRecovery={beginRecovery}
        completeRecovery={completeRecovery}
      />
    );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside an authenticated AuthProvider');
  return value;
}
