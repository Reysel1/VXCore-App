interface VXCoreDesktopApi {
  isDesktop: true;
  platform: NodeJS.Platform;
  agentUrl: string;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onWindowState: (callback: (state: { maximized: boolean }) => void) => () => void;
  pickPath: (options?: VXCorePickPathOptions) => Promise<string | null>;
  updater: VXCoreUpdaterApi;
}

interface VXCorePickPathOptions {
  mode?: "file" | "directory";
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

type VXCoreUpdateStatus =
  | "dev"
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

interface VXCoreUpdateInfo {
  version: string;
  [key: string]: unknown;
}

interface VXCoreUpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

interface VXCoreUpdateState {
  status: VXCoreUpdateStatus;
  version: string;
  info: VXCoreUpdateInfo | null;
  progress: VXCoreUpdateProgress | null;
  error: string | null;
  feedUrl: string | null;
  checkedAt: number | null;
}

interface VXCoreUpdaterApi {
  getState: () => Promise<VXCoreUpdateState>;
  check: () => Promise<VXCoreUpdateState>;
  download: () => Promise<VXCoreUpdateState>;
  install: () => Promise<VXCoreUpdateState>;
  setFeedUrl: (url: string) => Promise<VXCoreUpdateState>;
  onState: (callback: (state: VXCoreUpdateState) => void) => () => void;
}

interface Window {
  fiveosDesktop?: VXCoreDesktopApi;
}
