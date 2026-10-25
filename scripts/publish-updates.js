const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist-desktop");

function fail(message) {
  console.error(`[publish] ${message}`);
  process.exit(1);
}

function newestInstaller() {
  const dir = DIST;
  if (!fs.existsSync(dir)) fail(`No existe ${dir}. Ejecuta antes 'npm run desktop:build'.`);
  const candidates = fs
    .readdirSync(dir)
    .filter((f) => /^VXCore-Setup-.*\.exe$/.test(f))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.f;
}

function copyIfExists(from, toDir) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(toDir, { recursive: true });
  const dest = path.join(toDir, path.basename(from));
  fs.copyFileSync(from, dest);
  console.log(`[publish] → ${dest}`);
  return true;
}

const latestYml = path.join(DIST, "latest.yml");
if (!fs.existsSync(latestYml)) {
  fail(`No existe ${latestYml}. Ejecuta antes 'npm run desktop:build'.`);
}

const installer = newestInstaller();
if (!installer) fail("No se encontró ningún VXCore-Setup-*.exe en dist-desktop.");

const blockmap = installer.replace(/\.exe$/, ".exe.blockmap");

const version = fs
  .readFileSync(latestYml, "utf8")
  .match(/^version:\s*(\S+)/m)?.[1];
console.log(`[publish] Publicando versión ${version || "?"} (${installer})`);

const notesPath = path.join(ROOT, "docs", `publicacion-v${version}.md`);
const hasNotes = fs.existsSync(notesPath);
if (!hasNotes) {
  console.log(`[publish] ⚠ Sin ${path.basename(notesPath)}: la release saldrá con notas genéricas.`);
}

const targets = [path.join(ROOT, "agent", "updates")];
const appData = process.env.APPDATA;
if (appData) {
  const installed = path.join(appData, "VXCore", "data", "updates");
  if (fs.existsSync(path.dirname(installed))) targets.push(installed);
}

for (const target of targets) {
  copyIfExists(latestYml, target);
  copyIfExists(path.join(DIST, installer), target);
  copyIfExists(path.join(DIST, blockmap), target);
}

const REPO =
  String(require("../package.json").repository?.url || "").match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1] ||
  "Reysel1/VXCore-App";
const FEED_BASE = `https://github.com/${REPO}/releases/latest/download`;

function githubPublishMethod() {
  if (process.env.GITHUB_TOKEN) return "token";
  try {
    require("node:child_process").execSync("gh --version", { stdio: "ignore" });
    return "gh";
  } catch {
    return null;
  }
}

async function verifyFeed(expectedVersion) {
  const url = `${FEED_BASE}/latest.yml`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${url}?t=${Date.now()}`, {
        redirect: "follow",
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 200) {
        const body = await response.text().catch(() => "");
        const served = (body.match(/^version:\s*(.+)$/m) || [])[1]?.trim();

        if (expectedVersion && served && served !== expectedVersion) {
          if (attempt < 4) {
            console.log(
              `[publish]   El feed todavía sirve ${served} (se esperaba ${expectedVersion}); reintentando (${attempt}/4)…`
            );
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          console.error(
            `[publish] ❌ El feed sirve la versión ${served}, no la ${expectedVersion} que se acaba de publicar.`
          );
          console.error("[publish]   La release no llegó a crearse, o no quedó marcada como «latest».");
          process.exitCode = 1;
          return false;
        }

        console.log(
          `[publish] ✅ Feed remoto verificado: sirve la versión ${served ?? "?"}. Otras máquinas ya pueden actualizarse.`
        );
        return true;
      }
      if (attempt < 4) {
        console.log(`[publish]   Feed responde ${response.status}; reintentando (${attempt}/4)…`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
    } catch (e) {
      if (attempt < 4) {
        console.log("[publish]   Red inestable verificando el feed; reintentando…");
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      console.error("[publish] ⚠ No se pudo verificar el feed remoto:", (e.message || e).toString().slice(0, 200));
      process.exitCode = 1;
      return false;
    }
  }
  console.error(`[publish] ❌ El feed remoto responde 404/otros tras 4 intentos: ${url}`);
  console.error("[publish]   Causas típicas: el release quedó como pre-release, o faltó subir latest.yml.");
  console.error(`[publish]   Revisa https://github.com/${REPO}/releases y públicalo de nuevo.`);
  process.exitCode = 1;
  return false;
}

function publishToGithub() {
  const method = githubPublishMethod();
  const tag = `v${version}`;
  const files = [path.join(DIST, installer), path.join(DIST, blockmap), latestYml];
  if (!version) {
    console.log("[publish] ⚠ Sin versión en latest.yml: no se publicó en GitHub Releases.");
    return;
  }
  if (!method) {
    console.log("[publish] ⚠ Sin GitHub CLI ni GITHUB_TOKEN: no se publicó en GitHub Releases.");
    console.log(`[publish]   Para que otras máquinas se actualicen, publica en https://github.com/${REPO}/releases:`);
    for (const f of files) console.log(`[publish]     - ${path.basename(f)}`);
    return;
  }
  const { execSync } = require("node:child_process");
  if (method === "gh") {
    let hasRelease = true;
    try {
      execSync(`gh release view ${tag} --repo ${REPO}`, { stdio: "ignore" });
    } catch {
      hasRelease = false;
    }

    if (hasRelease) {
    let existing = [];
    try {
      const out = execSync(`gh release view ${tag} --repo ${REPO} --json assets`, {
        encoding: "utf8",
      });
      existing = (JSON.parse(out).assets || []).map((a) => a.name);
    } catch {}
    const missing = files.filter((f) => !existing.includes(path.basename(f)));
    if (missing.length > 0) {
      execSync(
        `gh release upload ${tag} ${missing.map((f) => `"${f}"`).join(" ")} --repo ${REPO} --clobber`,
        { stdio: "inherit" }
      );
    }
    const notesArg = hasNotes ? `--notes-file "${notesPath}"` : "";
    execSync(
      `gh release edit ${tag} --repo ${REPO} --latest --prerelease=false --draft=false ${notesArg}`.trim(),
      { stdio: "inherit" }
    );
    console.log(`[publish] ✅ Release ${tag} actualizado (assets subidos y marcado como Latest estable).`);
    } else {
    try {
      const notesArg = hasNotes
        ? `--notes-file "${notesPath}"`
        : `--notes "Publicado por scripts/publish-updates.js"`;
      execSync(
        `gh release create ${tag} ${files.map((f) => `"${f}"`).join(" ")} --repo ${REPO} ` +
          `--title "VXCore ${tag}" ${notesArg} --latest`,
        { stdio: "inherit" }
      );
      console.log(`[publish] ✅ Publicado en GitHub Releases: https://github.com/${REPO}/releases/tag/${tag}`);
    } catch (e2) {
      console.error("[publish] ❌ Fallo publicando en GitHub:", (e2.message || e2).toString().slice(0, 300));
      process.exitCode = 1;
    }
  }
  } else {
  const token = process.env.GITHUB_TOKEN;
  const api = "https://api.github.com";
  const auth = ["-H", `Authorization: token ${token}`, "-H", "Accept: application/vnd.github+json"];
  let uploadUrl;
  try {
    execSync(`curl -s -X DELETE ${auth.join(" ")} ${api}/repos/${REPO}/releases/tags/${tag}`, { stdio: "ignore" });
    const payload = {
      tag_name: tag,
      name: `VXCore ${tag}`,
      body: hasNotes ? fs.readFileSync(notesPath, "utf8") : "Publicado por scripts/publish-updates.js",
    };
    const payloadFile = path.join(DIST, "release-payload.json");
    fs.writeFileSync(payloadFile, JSON.stringify(payload), "utf8");
    const responseFile = path.join(DIST, "release-response.json");
    execSync(
      `curl -s -o "${responseFile}" -w "%{http_code}" -X POST ${auth.join(" ")} --data-binary "@${payloadFile}" ${api}/repos/${REPO}/releases`,
      { stdio: "pipe", encoding: "utf8" }
    );
    const created = JSON.parse(fs.readFileSync(responseFile, "utf8"));
    if (!created.upload_url) {
      throw new Error(
        `GitHub no creó el release (${created.message || "respuesta sin upload_url"}).`
      );
    }
    uploadUrl = created.upload_url.replace(/\{[^}]*\}$/, "");
  } catch (e) {
    console.error("[publish] No se pudo crear el release en GitHub:", (e.message || e).toString().slice(0, 300));
    process.exitCode = 1;
    return;
  }
  for (const f of files) {
    const name = path.basename(f);
    execSync(
      `curl -s -X POST ${auth.join(" ")} -H "Content-Type: application/octet-stream" ` +
        `--data-binary "@${f}" "${uploadUrl}?name=${name}"`,
      { stdio: "inherit" }
    );
  }
  console.log(`[publish] ✅ Publicado en GitHub Releases: https://github.com/${REPO}/releases/tag/${tag}`);
}
}

publishToGithub();
verifyFeed(version);

console.log("[publish] Feed actualizado. La app instalada lo detectará al comprobar actualizaciones.");
