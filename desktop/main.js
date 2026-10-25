const { app, BrowserWindow, Menu, Tray, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { fork, execFile } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const { initUpdater } = require("./updater");

app.setAppUserModelId("com.vxcore.panel");

const isDev = !app.isPackaged;
const PANEL_PORT = Number(process.env.FIVEOS_PANEL_PORT || (isDev ? 3000 : 3210));
const AGENT_PORT = Number(process.env.FIVEOS_AGENT_PORT || 4000);

process.env.FIVEOS_AGENT_PORT = String(AGENT_PORT);

const ROOT = isDev ? path.join(__dirname, "..") : process.resourcesPath;

const AGENT_CWD = isDev ? path.join(ROOT, "agent") : path.join(app.getPath("userData"), "data");

let mainWindow = null;
let tray = null;
let quitting = false;
let hiddenNoticeShown = false;
let panelProcess = null;
let agentProcess = null;
let splashWindow = null;
let splashReady = false;
let splashShownAt = 0;
const SPLASH_MIN_MS = 1900;
let bootState = { percent: 0, title: "Iniciando VXCore", detail: "Preparando el entorno…" };

function connects(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(800);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function isPortOpen(port) {
  const results = await Promise.all([connects(port, "127.0.0.1"), connects(port, "::1")]);
  return results.some(Boolean);
}

function probeHttp(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
        if (body.length > 20000) req.destroy();
      });
      res.on("end", () => resolve(body));
    });
    req.setTimeout(timeoutMs, () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

async function probeAgent(port) {
  const body = await probeHttp(`http://127.0.0.1:${port}/api/health`);
  if (!body) return null;
  try {
    const data = JSON.parse(body);
    if (data.status !== "Agent is running") return null;
    return { appVersion: data.appVersion, pid: data.pid };
  } catch {
    return null;
  }
}

function askAgentToStop(port) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: "/api/agent/shutdown", method: "POST" },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.setTimeout(4000, () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function waitForPortFree(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function isVxcorePanel(port) {
  const body = await probeHttp(`http://127.0.0.1:${port}/`);
  return !!body && body.includes("/_next/") && /VXCore|Panel de Control/i.test(body);
}

function reportPanelPort(port) {
  const agentPort = process.env.FIVEOS_AGENT_PORT || String(AGENT_PORT);
  const payload = JSON.stringify({ port });

  const req = http.request(
    {
      host: "127.0.0.1",
      port: Number(agentPort),
      path: "/api/tunnel/panel-port",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    },
    (res) => {
      if (res.statusCode !== 200) {
        console.error(`[VXCore] El agente rechazó el puerto del panel (${res.statusCode}).`);
      }
      res.resume();
    }
  );

  req.setTimeout(2500, () => req.destroy());
  req.on("error", (err) => {
    console.error("[VXCore] No se pudo informar al agente del puerto del panel:", err.message);
  });
  req.end(payload);
}

async function findFreePort(start) {
  for (let port = start; port < start + 50; port++) {
    if (!(await isPortOpen(port))) return port;
  }
  return start;
}

async function waitForPort(port, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(`[VXCore] ${label} no abrió el puerto ${port} a tiempo.`);
  return false;
}

function forkNode(scriptPath, options = {}) {
  const env = { ...process.env, ...options.env, ELECTRON_RUN_AS_NODE: "1" };
  return fork(scriptPath, options.args || [], {
    cwd: options.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
}

function userFolders() {
  const folders = {};
  for (const [name, key] of [["desktop", "VX_DESKTOP_DIR"], ["downloads", "VX_DOWNLOADS_DIR"]]) {
    try {
      folders[key] = app.getPath(name);
    } catch {}
  }
  return folders;
}

function pipeOutput(child, label) {
  child.stdout?.on("data", (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[${label}] ${d}`));
  child.on("exit", (code) => console.log(`[${label}] terminó con código ${code}`));
}

async function startAgent() {
  let port = AGENT_PORT;

  boot(8, `Comprobando el puerto ${port}`, "Buscando servicios de VXCore ya en marcha…");

  if (await isPortOpen(port)) {
    const running = await probeAgent(port);

    if (running && running.appVersion === app.getVersion()) {
      console.log(`[VXCore] Ya hay un agente VXCore ${running.appVersion} en el ${port}; se reutiliza.`);
      process.env.FIVEOS_AGENT_PORT = String(port);
      boot(45, "Agente VXCore ya en marcha", "Se reutiliza el que ya estaba corriendo.");
      return;
    }

    if (running) {
      console.log(
        `[VXCore] En el ${port} hay un agente de otra versión (${running.appVersion || "anterior a 0.7"}). Se le pide que salga.`
      );
      boot(14, "Retirando el agente anterior", "Había una versión antigua escuchando en ese puerto.");
      const stopped = (await askAgentToStop(port)) && (await waitForPortFree(port, 8000));
      if (!stopped) {
        console.warn(`[VXCore] El agente viejo del ${port} no se apartó; el nuevo usará otro puerto.`);
      }
    }

    if (await isPortOpen(port)) {
      port = await findFreePort(AGENT_PORT + 1);
      console.log(`[VXCore] El puerto ${AGENT_PORT} sigue ocupado; el agente usará el ${port}.`);
    }
  }

  process.env.FIVEOS_AGENT_PORT = String(port);

  const agentDir = path.join(ROOT, "agent");
  const entry = isDev
    ? path.join(agentDir, "node_modules", "tsx", "dist", "cli.mjs")
    : path.join(agentDir, "dist", "index.js");

  const args = isDev ? [path.join(agentDir, "src", "index.ts")] : [];

  boot(20, "Arrancando el Agente VXCore", "Es quien habla con tu servidor y con la base de datos.");

  fs.mkdirSync(AGENT_CWD, { recursive: true });

  agentProcess = forkNode(entry, {
    args,
    cwd: AGENT_CWD,
    env: { PORT: String(port), VX_APP_VERSION: app.getVersion(), ...userFolders() },
  });
  pipeOutput(agentProcess, "Agente");
  wireAgentIpc(agentProcess);

  boot(30, "Esperando al Agente VXCore", `Debe responder en el puerto ${port}.`);

  const up = await waitForPort(port, 30000, "El Agente VXCore");
  if (up && !(await probeAgent(port))) {
    console.error(`[VXCore] Algo responde en ${port} pero no es el Agente VXCore.`);
  }

  boot(45, up ? "Agente VXCore listo" : "El agente no respondió", "Verificando el panel…");
}

async function startPanel() {
  let port = PANEL_PORT;

  boot(52, "Comprobando el panel", "Verificando contenido…");

  if (await isPortOpen(port)) {
    let tries = 0;
    while (tries < 3) {
      if (await isVxcorePanel(port)) {
        console.log(`[VXCore] Panel ya disponible en ${port}; se reutiliza.`);
        boot(92, "Panel ya disponible", "Se reutiliza el que ya estaba sirviendo.");
        return port;
      }
      tries++;
      await new Promise((r) => setTimeout(r, 1200));
    }

    if (isDev) {
      console.error(`[VXCore] No hay panel en el puerto ${port}.`);
      return false;
    }

    port = await findFreePort(PANEL_PORT + 1);
    console.log(`[VXCore] El puerto ${PANEL_PORT} lo ocupa otra app; el panel usará el ${port}.`);
  }

  boot(62, "Arrancando el panel", "Cargando la interfaz de VXCore…");

  const standalone = path.join(ROOT, ".next", "standalone", "server.js");
  panelProcess = forkNode(standalone, {
    cwd: path.dirname(standalone),
    env: { PORT: String(port), HOSTNAME: "127.0.0.1" },
  });
  pipeOutput(panelProcess, "Panel");

  boot(78, "Esperando al panel", `Debe servir la interfaz en el puerto ${port}.`);

  if (!(await waitForPort(port, 60000, "El panel"))) return false;

  boot(92, "Panel listo", "Preparando la ventana…");
  return port;
}

const ERROR_CANCELLED = 1223;

function allowFirewallElevated(program, ruleName) {
  return new Promise((resolve) => {
    const safe = (s) => String(s).replace(/"/g, '""');
    const winProgram = String(program).replace(/\//g, "\\");
    const script = [
      '$ErrorActionPreference = "Continue"',
      `netsh advfirewall firewall delete rule name="${safe(ruleName)}" 2>$null | Out-Null`,
      `netsh advfirewall firewall add rule name="${safe(ruleName)}" dir=in action=allow program="${safe(winProgram)}" enable=yes profile=any | Out-Null`,
    ].join("\r\n");

    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const launcher =
      "try { Start-Process powershell -Verb RunAs -Wait -ErrorAction Stop -ArgumentList " +
      `'-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}' } ` +
      `catch { exit ${ERROR_CANCELLED} }`;

    const ps = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", launcher];

    execFile("powershell", ps, { timeout: 60000 }, (err) => {
      if (!err) {
        resolve({ ok: true, cancelled: false, error: null });
        return;
      }
      const cancelled = err.code === ERROR_CANCELLED;
      resolve({
        ok: false,
        cancelled,
        error: cancelled ? "El permiso no se concedió." : err.message,
      });
    });
  });
}

const VCREDIST_URL = "https://aka.ms/vs/17/release/vc_redist.x64.exe";

async function installVcRedistElevated() {
  const target = path.join(app.getPath("temp"), `vxcore-vc_redist-${Date.now()}.exe`);

  try {
    const response = await fetch(VCREDIST_URL, { redirect: "follow" });
    if (!response.ok) {
      return { ok: false, error: `Microsoft devolvió ${response.status} al descargar el runtime.` };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1_000_000 || bytes.subarray(0, 2).toString() !== "MZ") {
      return { ok: false, error: "Lo descargado de Microsoft no es un instalador válido." };
    }
    fs.writeFileSync(target, bytes);
  } catch (err) {
    return { ok: false, error: `No se pudo descargar el runtime: ${err.message}` };
  }

  try {
    return await new Promise((resolve) => {
      const launcher =
        `try { $p = Start-Process -FilePath '${target.replace(/'/g, "''")}' -Verb RunAs -Wait -PassThru ` +
        `-ArgumentList '/install','/passive','/norestart' -ErrorAction Stop; exit $p.ExitCode } ` +
        `catch { exit ${ERROR_CANCELLED} }`;

      execFile(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", launcher],
        { timeout: 5 * 60 * 1000 },
        (err) => {
          const code = err ? err.code : 0;
          if (!err || code === 1638 || code === 3010) {
            resolve({ ok: true, cancelled: false, error: null });
            return;
          }
          const cancelled = code === ERROR_CANCELLED;
          resolve({
            ok: false,
            cancelled,
            error: cancelled
              ? "El permiso no se concedió."
              : `El instalador de Microsoft terminó con el código ${code}.`,
          });
        }
      );
    });
  } finally {
    fs.rm(target, { force: true }, () => {});
  }
}

function wireAgentIpc(agent) {
  const send = (payload) => {
    if (agent && !agent.killed && typeof agent.send === "function") agent.send(payload);
  };

  agent.on("message", (msg) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "provision-vcredist") {
      installVcRedistElevated()
        .then((result) =>
          send({
            type: "provision-result",
            id: msg.id,
            ok: result.ok,
            cancelled: Boolean(result.cancelled),
            error: result.error,
          })
        )
        .catch((err) =>
          send({
            type: "provision-result",
            id: msg.id,
            ok: false,
            error: String((err && err.message) || err),
          })
        );
      return;
    }

    if (msg.type !== "firewall-allow") return;

    const reply = (result) => {
      if (agent && !agent.killed && typeof agent.send === "function") {
        agent.send({
          type: "firewall-result",
          id: msg.id,
          ok: result.ok,
          cancelled: Boolean(result.cancelled),
          error: result.error,
        });
      }
    };

    if (
      msg.ruleName !== "VXCore FXServer" ||
      typeof msg.program !== "string" ||
      !path.isAbsolute(msg.program) ||
      !["fxserver.exe", "cfx-server.exe"].includes(path.basename(msg.program).toLowerCase()) ||
      /["$`\r\n]/.test(msg.program) ||
      !fs.existsSync(msg.program)
    ) {
      reply({ ok: false, error: "Petición rechazada: sólo se permite la regla del FXServer." });
      return;
    }

    allowFirewallElevated(msg.program, msg.ruleName)
      .then(reply)
      .catch((err) => reply({ ok: false, error: String((err && err.message) || err) }));
  });
}

function stopChildren() {
  for (const child of [panelProcess, agentProcess]) {
    if (!child || child.killed) continue;
    try {
      child.kill();
    } catch {}
  }
  panelProcess = null;
  agentProcess = null;
}

function createTray() {
  if (tray) return;

  const icon = path.join(ROOT, "public", "vertex", "logo-mark.png");
  try {
    tray = new Tray(icon);
  } catch (err) {
    console.error("[VXCore] No se pudo crear el icono de la bandeja:", err.message);
    return;
  }

  tray.setToolTip("VXCore");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir VXCore", click: showMainWindow },
      { type: "separator" },
      {
        label: "Salir de VXCore",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );

  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 420,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    icon: path.join(ROOT, "public", "vertex", "logo-mark.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, "splash.html"), {
    query: {
      logo: pathToFileURL(path.join(ROOT, "public", "vertex", "logo-glyph.png")).href,
      version: `v${app.getVersion()}`,
    },
  });

  splashWindow.once("ready-to-show", () => {
    splashShownAt = Date.now();
    splashWindow?.show();
  });

  splashWindow.webContents.on("did-finish-load", () => {
    splashReady = true;
    pushBoot();
  });

  splashWindow.on("closed", () => {
    splashWindow = null;
    splashReady = false;
  });
}

function boot(percent, title, detail) {
  bootState = { percent, title, detail: detail || bootState.detail };
  console.log(`[VXCore] ${percent}% · ${title}`);
  pushBoot();
}

function pushBoot() {
  if (!splashWindow || splashWindow.isDestroyed() || !splashReady) return;
  splashWindow.webContents
    .executeJavaScript(`window.vxBoot && window.vxBoot(${JSON.stringify(bootState)})`)
    .catch(() => {});
}

async function closeSplash() {
  if (!splashWindow) return;

  const visible = Date.now() - splashShownAt;
  if (splashShownAt && visible < SPLASH_MIN_MS) {
    await new Promise((resolve) => setTimeout(resolve, SPLASH_MIN_MS - visible));
  }

  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  splashWindow = null;
  splashReady = false;
}

function createWindow(panelPort) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: "#0a0a0a",
    hasShadow: true,
    roundedCorners: true,
    icon: path.join(ROOT, "public", "vertex", "logo-mark.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on("console-message", (event) => {
    const level = ["debug", "info", "warning", "error"][event.level] ?? "info";
    console.log(`[Panel:${level}] ${event.message}`);
  });

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`[VXCore] El preload falló (${preloadPath}):`, error);
  });

  mainWindow.loadURL(`http://127.0.0.1:${panelPort}`);

  mainWindow.once("ready-to-show", async () => {
    boot(100, "VXCore listo", "Abriendo el panel…");
    await closeSplash();
    mainWindow?.show();
  });

  const emitState = () => {
    mainWindow?.webContents.send("window:state", { maximized: mainWindow.isMaximized() });
  };
  mainWindow.on("maximize", emitState);
  mainWindow.on("unmaximize", emitState);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return { action: "deny" };
    }

    const isOwnPanel = target.origin === `http://127.0.0.1:${panelPort}`;
    if (isOwnPanel && target.pathname.startsWith("/ventana/")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          frame: true,
          backgroundColor: "#0a0a0a",
          minWidth: 360,
          minHeight: 240,
          autoHideMenuBar: true,
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    }

    if (["http:", "https:", "mailto:"].includes(target.protocol)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (quitting || !tray) return;

    event.preventDefault();
    mainWindow.hide();

    if (!hiddenNoticeShown) {
      hiddenNoticeShown = true;
      tray.displayBalloon?.({
        title: "VXCore sigue funcionando",
        content:
          "Tu servidor y el acceso remoto siguen en marcha. Para salir del todo, " +
          "clic derecho aquí → Salir de VXCore.",
      });
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("window:minimize", () => mainWindow?.minimize());
ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle("window:close", () => mainWindow?.close());
ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);

ipcMain.handle("dialog:pick-path", async (_event, options = {}) => {
  if (!mainWindow) return null;

  const directory = options.mode === "directory";
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || (directory ? "Elige una carpeta" : "Elige un fichero"),
    defaultPath: options.defaultPath || undefined,
    properties: [directory ? "openDirectory" : "openFile"],
    filters: directory ? undefined : options.filters,
  });

  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

app.whenReady().then(async () => {
  createSplash();

  await startAgent();

  const panelPort = await startPanel();
  if (!panelPort) {
    splashShownAt = 0;
    await closeSplash();
    dialog.showErrorBox(
      "VXCore no pudo arrancar",
      `El panel no respondió en el puerto ${PANEL_PORT}.\n\n` +
        (isDev
          ? "En desarrollo, arranca antes el panel con: npm run dev"
          : "Prueba a reiniciar la aplicación. Si persiste, revisa la consola.")
    );
    app.quit();
    return;
  }

  createWindow(panelPort);
  createTray();

  reportPanelPort(panelPort);

  initUpdater({ getWindow: () => mainWindow });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!tray) {
    stopChildren();
    app.quit();
  }
});

app.on("before-quit", () => {
  quitting = true;
  stopChildren();
});

process.on("exit", stopChildren);
