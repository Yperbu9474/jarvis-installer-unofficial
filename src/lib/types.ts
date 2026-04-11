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

export type InstallProgress = {
  percent: number;
  message: string;
  chunk?: string;
};

export type UpdateResult = {
  ok: boolean;
  output: string;
  newVersion?: string;
};

export type LifecycleResult = {
  ok: boolean;
  action: LifecycleAction;
  output: string;
  dashboardUrl: string;
};

export type InstallState = {
  installed: boolean;
  running: boolean;
  mode: InstallMode;
  details: string;
  dashboardUrl: string;
};

export type ProxyConfig = {
  domain: string;
  cfApiToken: string;
  cfZoneId: string;
  email: string;
  vpsIp: string;
  port: number;
};

export type ProxyResult = {
  ok: boolean;
  output: string;
  url?: string;
};

export type JarvisReleaseNotice = {
  hasUpdate: boolean;
  releaseTag: string;
  releaseName: string;
  releaseUrl: string;
  publishedAt?: string;
  releaseNotes?: string;
};

export type InstallerUpdateState = {
  status: 'idle' | 'checking' | 'downloading' | 'ready' | 'up-to-date' | 'error' | 'unsupported';
  currentVersion: string;
  latestVersion?: string;
  progress?: number;
  message: string;
};
