import type { SocialRealtimeEvent } from '@doctor/contracts';
import { useEffect } from 'react';

declare global {
  interface Window {
    carelinkRealtime?: {
      subscribe(listener: (event: SocialRealtimeEvent) => void): () => void;
      setSessionToken?(token: string | null): Promise<{ subscribed: boolean }>;
    };
  }
}

export function useSocialRealtime(
  listener: (event: SocialRealtimeEvent) => void,
  onConnected?: () => void,
): void {
  useEffect(() => {
    if (window.carelinkRealtime) {
      const unsubscribe = window.carelinkRealtime.subscribe(listener);
      onConnected?.();
      return unsubscribe;
    }
    if (import.meta.env.MODE === 'test' || !['http:', 'https:'].includes(window.location.protocol))
      return;

    let socket: WebSocket | undefined;
    let reconnect: number | undefined;
    let stopped = false;
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/social/events`);
      socket.addEventListener('open', () => onConnected?.());
      socket.addEventListener('message', (message) => {
        try {
          listener(JSON.parse(String(message.data)) as SocialRealtimeEvent);
        } catch {
          // Ignore malformed transport frames; API queries remain the source of truth.
        }
      });
      socket.addEventListener('close', () => {
        if (!stopped) reconnect = window.setTimeout(connect, 1500);
      });
    };
    connect();
    return () => {
      stopped = true;
      if (reconnect) window.clearTimeout(reconnect);
      socket?.close();
    };
  }, [listener, onConnected]);
}
