const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const DEST_DIR = path.join(ROOT, "vendor", "cloudflared");

const PINNED_VERSION = "2026.7.3";

const TARGETS = {
  win32: { asset: "cloudflared-windows-amd64.exe", file: "cloudflared.exe" },
  linux: { asset: "cloudflared-linux-amd64", file: "cloudflared" },
};

function fail(message) {
  console.error(`[cloudflared] ${message}`);
  process.exit(1);
}

async function main() {
  const target = TARGETS[process.platform];
  if (!target) {
    fail(`Plataforma no soportada por este script: ${process.platform}`);
  }

  const dest = path.join(DEST_DIR, target.file);
  if (fs.existsSync(dest) && !process.env.CLOUDFLARED_FORCE) {
    const { size } = fs.statSync(dest);
    console.log(`[cloudflared] Ya está (${(size / 1e6).toFixed(1)} MB). CLOUDFLARED_FORCE=1 para rebajarlo.`);
    return;
  }

  const version = process.env.CLOUDFLARED_VERSION || PINNED_VERSION;
  const url = `https://github.com/cloudflare/cloudflared/releases/download/${version}/${target.asset}`;

  console.log(`[cloudflared] Bajando ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) fail(`La descarga devolvió ${response.status}. ¿Existe esa versión?`);

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length < 5_000_000) {
    fail(`Lo descargado ocupa ${bytes.length} bytes: eso no es el binario.`);
  }
  if (process.platform === "win32" && bytes.subarray(0, 2).toString() !== "MZ") {
    fail("Lo descargado no es un ejecutable de Windows.");
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.writeFileSync(dest, bytes);
  if (process.platform !== "win32") fs.chmodSync(dest, 0o755);

  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  console.log(`[cloudflared] → ${dest} (${(bytes.length / 1e6).toFixed(1)} MB)`);
  console.log(`[cloudflared] sha256: ${sha}`);
  console.log("[cloudflared] Apunta esa suma si quieres poder verificar la copia más adelante.");
}

main().catch((error) => fail(error.message));
