const { contextBridge, ipcRenderer } = require("electron");

function markDesktop() {
  document.documentElement.classList.add("app-desktop");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", markDesktop);
} else {
  markDesktop();
}

contextBridge.exposeInMainWorld("fiveosDesktop", {
  isDesktop: true,
  platform: process.platform,

  agentUrl: `http://127.0.0.1:${process.env.FIVEOS_AGENT_PORT || 4000}`,

  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),

  pickPath: (options) => ipcRenderer.invoke("dialog:pick-path", options),

  onWindowState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("window:state", listener);
    return () => ipcRenderer.removeListener("window:state", listener);
  },

  updater: {
    getState: () => ipcRenderer.invoke("update:get-state"),
    check: () => ipcRenderer.invoke("update:check"),
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.invoke("update:install"),
    setFeedUrl: (url) => ipcRenderer.invoke("update:set-feed-url", url),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("update:state", listener);
      return () => ipcRenderer.removeListener("update:state", listener);
    },
  },
});
