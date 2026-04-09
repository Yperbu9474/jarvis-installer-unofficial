/// <reference types="vite/client" />

import type { InstallProfile, InstallResult, LifecycleAction, LifecycleResult, InstallState, SystemSummary } from './lib/types';

declare global {
  interface Window {
    jarvisApi: {
      systemSummary: () => Promise<SystemSummary>;
      getProfile: () => Promise<InstallProfile | null>;
      detectState: (profile: InstallProfile) => Promise<InstallState>;
      saveProfile: (profile: InstallProfile) => Promise<InstallProfile>;
      install: (profile: InstallProfile) => Promise<InstallResult>;
      lifecycle: (profile: InstallProfile, action: LifecycleAction) => Promise<LifecycleResult>;
      openDashboard: (url: string) => Promise<void>;
      terminalCreate: (payload: { profile: InstallProfile; purpose: 'onboard' | 'shell' }) => Promise<{ id: string }>;
      terminalWrite: (id: string, data: string) => Promise<{ ok: true }>;
      terminalResize: (id: string, cols: number, rows: number) => Promise<{ ok: true }>;
      terminalClose: (id: string) => Promise<{ ok: true }>;
      onTerminalData: (listener: (payload: { id: string; data: string }) => void) => () => void;
    };
  }
}

export {};
