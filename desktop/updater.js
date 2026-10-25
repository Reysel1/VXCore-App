const { app, dialog, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("node:path");
const fs = require("node:fs");

const DEFAULT_FEED_URL = "http://127.0.0.1:4000/updates";
const REMOTE_REPO =
  String(require("../package.json").repository?.url || "").match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1] ||
  "Reysel1/VXCore-App";
const REMOTE_FEED_URL =
  process.env.VX_UPDATE_REMOTE_URL || `https://github.com/${REMOTE_REPO}/releases/latest/download`;

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function switchToRemoteFeed() {
  if (fixedFeedUrl) return;
  console.log(`[Updater] Probando feed remoto: ${REMOTE_FEED_URL}`);
  feedIndex = 1;
  applyFeed();
  setState({ status: "checking", error: null });
  autoUpdater.checkForUpdates().catch(() => {});
}

let getWindow = () => null;
let initialized = false;

let state = {
  status: "idle",
  version: app.getVersion(),
  info: null,
  progress: null,
  error: null,
  feedUrl: null,
  checkedAt: null,
};

function emit() {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("update:state", state);
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

function feedConfigPath() {
  return path.join(app.getPath("userData"), "updates-config.json");
}

function resolveFeedUrl() {
  if (process.env.VX_UPDATE_FEED_URL) return process.env.VX_UPDATE_FEED_URL.trim();
  try {
    const cfg = JSON.parse(fs.readFileSync(feedConfigPath(), "utf8"));
    if (typeof cfg.feedUrl === "string" && cfg.feedUrl.trim()) return cfg.feedUrl.trim();
  } catch {}
  return null;
}

let fixedFeedUrl = null;
let feedIndex = 0;

function currentFeedUrl() {
  if (fixedFeedUrl) return fixedFeedUrl;
  return feedIndex === 0
    ? `http://127.0.0.1:${process.env.FIVEOS_AGENT_PORT || 4000}/updates`
    : REMOTE_FEED_URL;
}

function applyFeed() {
  const url = currentFeedUrl();
  state.feedUrl = url;

  autoUpdater.setFeedURL({ provider: "generic", url });
}

function wireUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  fixedFeedUrl = resolveFeedUrl();
  applyFeed();

  autoUpdater.on("checking-for-update", () => setState({ status: "checking", error: null }));
  autoUpdater.on("update-available", (info) =>
    setState({ status: "available", info, error: null })
  );
  autoUpdater.on("update-not-available", () => {
    if (!fixedFeedUrl && feedIndex === 0) {
      switchToRemoteFeed();
      return;
    }
    setState({ status: "not-available", info: null, checkedAt: Date.now() });
  });
  autoUpdater.on("download-progress", (p) =>
    setState({
      status: "downloading",
      progress: {
        percent: Math.round(p.percent * 10) / 10,
        transferred: p.transferred,
        total: p.total,
        bytesPerSecond: p.bytesPerSecond,
      },
    })
  );
  autoUpdater.on("update-downloaded", (info) =>
    setState({ status: "downloaded", info, progress: null, checkedAt: Date.now() })
  );
  autoUpdater.on("error", (err) => {
    if (!fixedFeedUrl && feedIndex === 0) {
      switchToRemoteFeed();
      return;
    }
    setState({
      status: "error",
      error: (err && err.message) || String(err),
      progress: null,
    });
  });
}

async function checkForUpdates() {
  if (
    !app.isPackaged ||
    state.status === "checking" ||
    state.status === "downloading" ||
    state.status === "downloaded"
  ) {
    return state;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setState({ status: "error", error: (err && err.message) || String(err) });
  }
  return state;
}

function isAcceptableFeedUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  return parsed.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
}

async function setFeedUrl(rawUrl) {
  const url = String(rawUrl || "").trim() || DEFAULT_FEED_URL;
  if (!isAcceptableFeedUrl(url)) {
    setState({
      status: "error",
      error: "El feed tiene que ser una dirección https:// (o http:// de este mismo equipo).",
    });
    return state;
  }

  if (url !== DEFAULT_FEED_URL && url !== fixedFeedUrl) {
    const win = getWindow();
    const options = {
      type: "warning",
      buttons: ["Cancelar", "Usar este origen"],
      defaultId: 0,
      cancelId: 0,
      title: "Origen de actualizaciones",
      message: "¿Descargar las actualizaciones de VXCore desde este origen?",
      detail: `${url}\n\nVXCore instalará lo que se publique ahí. Acéptalo sólo si es un servidor tuyo o de confianza.`,
      noLink: true,
    };
    const { response } =
      win && !win.isDestroyed() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response !== 1) return state;
  }

  try {
    fs.mkdirSync(path.dirname(feedConfigPath()), { recursive: true });
    fs.writeFileSync(feedConfigPath(), JSON.stringify({ feedUrl: url }, null, 2));
  } catch (err) {
    setState({ status: "error", error: `No se pudo guardar el feed: ${err.message}` });
    return state;
  }
  fixedFeedUrl = url;
  feedIndex = 0;
  autoUpdater.setFeedURL({ provider: "generic", url });
  setState({ feedUrl: url, error: null });
  return checkForUpdates();
}

function initUpdater(options = {}) {
  getWindow = options.getWindow || getWindow;
  if (initialized) return;
  initialized = true;

  ipcMain.handle("update:get-state", () => state);
  ipcMain.handle("update:check", () => checkForUpdates());
  ipcMain.handle("update:download", async () => {
    await autoUpdater.downloadUpdate();
    return state;
  });
  ipcMain.handle("update:install", () => {
    autoUpdater.quitAndInstall(true, true);
    return state;
  });
  ipcMain.handle("update:set-feed-url", (_event, url) => setFeedUrl(url));

  if (!app.isPackaged) {
    setState({ status: "dev", feedUrl: null });
    return;
  }

  wireUpdater();

  setTimeout(() => {
    if (app.isPackaged) checkForUpdates();
  }, 4000);

  setInterval(() => {
    if (app.isPackaged) checkForUpdates();
  }, CHECK_INTERVAL_MS);
}

module.exports = { initUpdater };
