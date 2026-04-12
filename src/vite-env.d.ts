/// <reference types="vite/client" />

import type {
  InstallProfile,
  InstallProgress,
  InstallResult,
  InstallerUpdateState,
  JarvisReleaseNotice,
  LifecycleAction,
  LifecycleResult,
  InstallState,
  SystemSummary,
  UpdateResult,
  ProxyConfig,
  ProxyResult,
} from './lib/types';

declare global {
  interface Window {
    jarvisApi: {
      systemSummary: () => Promise<SystemSummary>;
      getProfile: () => Promise<InstallProfile | null>;
      detectState: (profile: InstallProfile) => Promise<InstallState>;
      saveProfile: (profile: InstallProfile) => Promise<InstallProfile>;
      install: (profile: InstallProfile) => Promise<InstallResult>;
      update: (profile: InstallProfile) => Promise<UpdateResult>;
      lifecycle: (profile: InstallProfile, action: LifecycleAction) => Promise<LifecycleResult>;
      openDashboard: (url: string) => Promise<void>;
      getReleaseNotice: () => Promise<JarvisReleaseNotice>;
      acknowledgeRelease: (releaseTag: string) => Promise<{ ok: true }>;
      getInstallerUpdateState: () => Promise<InstallerUpdateState>;
      applyInstallerUpdate: () => Promise<{ ok: true }>;
      terminalCreate: (payload: { profile: InstallProfile; purpose: 'onboard' | 'shell'; cols?: number; rows?: number }) => Promise<{ id: string }>;
      terminalWrite: (id: string, data: string) => Promise<{ ok: true }>;
      terminalResize: (id: string, cols: number, rows: number) => Promise<{ ok: true }>;
      terminalClose: (id: string) => Promise<{ ok: true }>;
      onTerminalData: (listener: (payload: { id: string; data: string }) => void) => () => void;
      onInstallerUpdate: (listener: (payload: InstallerUpdateState) => void) => () => void;
      onInstallProgress: (listener: (payload: InstallProgress) => void) => () => void;
      setupProxy: (config: ProxyConfig) => Promise<ProxyResult>;
    };
  }
}

export {};
