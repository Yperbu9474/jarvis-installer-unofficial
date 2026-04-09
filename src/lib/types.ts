export type InstallMode = 'native' | 'docker' | 'wsl2';

export type LifecycleAction = 'start' | 'stop' | 'restart' | 'status' | 'logs';

export type InstallProfile = {
  mode: InstallMode;
  port: number;
  jarvisRepo: string;
  dashboardUrl?: string;
  dataDir?: string;
  containerName?: string;
  installSidecar: boolean;
  wslDistro?: string;
};

export type SystemSummary = {
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  supportedModes: InstallMode[];
  hasDocker: boolean;
  hasBun: boolean;
  bunVersion?: string;
  wslDistros: string[];
};

export type InstallResult = {
  ok: boolean;
  output: string;
  dashboardUrl: string;
};

export type LifecycleResult = {
  ok: boolean;
  action: LifecycleAction;
  output: string;
  dashboardUrl: string;
};
