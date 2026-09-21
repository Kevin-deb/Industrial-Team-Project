import { contextBridge, ipcRenderer } from 'electron';
import type { SocialRealtimeEvent } from '@doctor/contracts';

contextBridge.exposeInMainWorld('carelinkRealtime', {
  subscribe(listener: (event: SocialRealtimeEvent) => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: SocialRealtimeEvent) =>
      listener(payload);
    ipcRenderer.on('carelink:social-event', handler);
    return () => ipcRenderer.removeListener('carelink:social-event', handler);
  },
  setSessionToken(token: string | null) {
    return ipcRenderer.invoke('carelink:set-session-token', token);
  },
});
