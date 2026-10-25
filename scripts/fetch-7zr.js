const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const DEST_DIR = path.join(ROOT, "vendor", "7zr");
const DEST = path.join(DEST_DIR, "7zr.exe");

const URL = "https://github.com/ip7z/7zip/releases/download/26.04/7zr.exe";

const EXPECTED_SHA256 = "256feca8e274e5da655e2a284fabafd9f554365eb164862089dacd4e8276d282";

function fail(message) {
  console.error(`[7zr] ${message}`);
  process.exit(1);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  if (fs.existsSync(DEST) && !process.env.SEVENZIP_FORCE) {
    const actual = sha256(fs.readFileSync(DEST));
    if (actual === EXPECTED_SHA256) {
      console.log("[7zr] Ya está y la suma cuadra.");
      return;
    }
    console.log("[7zr] El que hay no cuadra con la suma esperada; se baja de nuevo.");
  }

  console.log(`[7zr] Bajando ${URL}`);
  const response = await fetch(URL, { redirect: "follow" });
  if (!response.ok) fail(`La descarga devolvió ${response.status}.`);

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 2).toString() !== "MZ") {
    fail("Lo descargado no es un ejecutable de Windows.");
  }

  const actual = sha256(bytes);
  if (actual !== EXPECTED_SHA256) {
    fail(
      `La suma no coincide.\n` +
        `  esperada: ${EXPECTED_SHA256}\n` +
        `  bajada:   ${actual}\n` +
        `  Probablemente 7-Zip ha sacado versión nueva. Compruébala y actualiza EXPECTED_SHA256.`
    );
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });
  fs.writeFileSync(DEST, bytes);
  console.log(`[7zr] → ${DEST} (${(bytes.length / 1024).toFixed(0)} KB, suma verificada)`);
}

main().catch((error) => fail(error.message));
