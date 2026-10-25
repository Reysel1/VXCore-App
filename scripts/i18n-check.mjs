#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDIOMAS = ["en", "pt", "fr", "de"];

const PARTES = {
  panel: {
    dirs: ["src"],
    ext: /\.(ts|tsx)$/,
    ignorar: [/^src[\\/]i18n[\\/]messages/],
    marcas: ["t", "msg"],
    marcasConIdioma: ["tIn"],
    diccionario: (l) => `src/i18n/messages/${l}.json`,
  },
  juego: {
    dirs: ["fiveos-nui/src"],
    ext: /\.(ts|tsx)$/,
    ignorar: [/^fiveos-nui[\\/]src[\\/]i18n[\\/].*\.json$/],
    marcas: ["t", "msg"],
    diccionario: (l) => `fiveos-nui/src/i18n/${l}.json`,
  },
  agente: {
    dirs: ["agent/src"],
    ext: /\.ts$/,
    ignorar: [/\.test\.ts$/],
    marcas: ["tr", "trMsg"],
    diccionario: (l) => `agent/src/i18n/${l}.json`,
  },
  lua: {
    dirs: ["vxcore"],
    ext: /\.lua$/,
    ignorar: [],
    marcas: ["VX.t", "VX.msg"],
    diccionario: (l) => `vxcore/source/locales/${l}.json`,
  },
};

function recorrer(dir, ext, salida = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return salida;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (["node_modules", ".next", "dist"].includes(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(rel, ext, salida);
    else if (ext.test(e.name)) salida.push(rel);
  }
  return salida;
}

function desescapar(s) {
  return s.replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}

function sinComentarios(codigo, lua) {
  if (lua) {
    return codigo.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, "").replace(/^\s*--.*$/gm, "");
  }
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function extraer(codigoOriginal, marcas, marcasConIdioma = []) {
  const codigo = sinComentarios(codigoOriginal, marcas.some((m) => m.startsWith("VX.")));
  const frases = [];
  const errores = [];
  const patrones = [
    ...marcas.map((marca) => ({ marca, antes: "" })),
    ...marcasConIdioma.map((marca) => ({ marca, antes: "[\\w.]+\\s*,\\s*" })),
  ];
  for (const { marca, antes } of patrones) {
    const nombre = marca.replace(".", "\\.");
    const prefijo = marca.includes(".") ? "" : "(?<![\\w.$])";
    const re = new RegExp(`${prefijo}${nombre}\\(\\s*${antes}(["'\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1\\s*[,)]`, "g");
    for (const m of codigo.matchAll(re)) {
      if (m[1] === "`" && m[2].includes("${")) {
        errores.push(`${marca}(\`${m[2].slice(0, 60)}…\`) lleva \${…}: usa {hueco} y parámetros`);
        continue;
      }
      frases.push(desescapar(m[2]));
    }
  }
  return { frases, errores };
}

function frasesDe(parte) {
  const cfg = PARTES[parte];
  const donde = new Map();
  const errores = [];
  for (const dir of cfg.dirs) {
    for (const fichero of recorrer(dir, cfg.ext)) {
      if (cfg.ignorar.some((re) => re.test(fichero))) continue;
      const { frases, errores: e } = extraer(fs.readFileSync(path.join(ROOT, fichero), "utf8"), cfg.marcas, cfg.marcasConIdioma);
      for (const f of frases) if (!donde.has(f)) donde.set(f, fichero);
      for (const x of e) errores.push(`${fichero}: ${x}`);
    }
  }
  return { donde, errores };
}

function leerDiccionario(parte, idioma) {
  const ruta = path.join(ROOT, PARTES[parte].diccionario(idioma));
  if (!fs.existsSync(ruta)) return {};
  return JSON.parse(fs.readFileSync(ruta, "utf8"));
}

const huecos = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const [modo, parteArg, idiomaArg] = process.argv.slice(2);

if (modo === "faltan") {
  if (!PARTES[parteArg] || !IDIOMAS.includes(idiomaArg)) {
    console.error(`Uso: faltan <${Object.keys(PARTES).join("|")}> <${IDIOMAS.join("|")}>`);
    process.exit(2);
  }
  const { donde } = frasesDe(parteArg);
  const dic = leerDiccionario(parteArg, idiomaArg);
  console.log(JSON.stringify([...donde.keys()].filter((f) => !(f in dic)), null, 1));
  process.exit(0);
}

if (modo === "usadas") {
  if (!PARTES[parteArg]) {
    console.error(`Uso: usadas <${Object.keys(PARTES).join("|")}>`);
    process.exit(2);
  }
  console.log(JSON.stringify([...frasesDe(parteArg).donde.keys()], null, 1));
  process.exit(0);
}

let fallos = 0;
for (const parte of Object.keys(PARTES)) {
  const { donde, errores } = frasesDe(parte);
  if (modo === "stats") {
    console.log(`${parte.padEnd(7)} ${donde.size} frases`);
    continue;
  }
  for (const e of errores) {
    console.error(`✖ ${e}`);
    fallos++;
  }
  for (const idioma of IDIOMAS) {
    const dic = leerDiccionario(parte, idioma);
    const faltan = [...donde.keys()].filter((f) => !(f in dic) || typeof dic[f] !== "string" || !dic[f].trim());
    const malHueco = [...donde.keys()].filter((f) => f in dic && huecos(f) !== huecos(dic[f]));
    const sobran = Object.keys(dic).filter((f) => !donde.has(f));
    if (faltan.length || malHueco.length) {
      fallos += faltan.length + malHueco.length;
      console.error(`✖ ${parte}/${idioma}: faltan ${faltan.length}, huecos distintos ${malHueco.length}`);
      for (const f of faltan.slice(0, 5)) console.error(`    falta: «${f.slice(0, 80)}» (${donde.get(f)})`);
      for (const f of malHueco.slice(0, 5)) console.error(`    huecos: «${f.slice(0, 80)}» → «${dic[f].slice(0, 80)}»`);
    } else {
      console.log(`✔ ${parte}/${idioma}: ${donde.size} frases${sobran.length ? ` (${sobran.length} sin uso)` : ""}`);
    }
  }
}

if (modo !== "stats" && fallos) {
  console.error(`\n${fallos} problema(s) de traducción.`);
  process.exit(1);
}
