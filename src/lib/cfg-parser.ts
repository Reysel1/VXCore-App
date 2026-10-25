import { t } from "@/i18n";
export interface ParsedServerConfig {
  name: string;
  maxClients: number;
  port: number;
  ip: string;
  database: {
    connected: boolean;
    connectionString?: string;
    dbName?: string;
    host?: string;
  };
  licenseKeyConfigured: boolean;
  resources: string[];
  framework: string;
  game: "fivem" | "redm";
  rawContent: string;
}

export function parseServerCfg(cfgContent: string): ParsedServerConfig {
  const lines = cfgContent.split(/\r?\n/);

  let name = t("Servidor FiveM (Detectado)");
  let maxClients = 32;
  let port = 30120;
  let ip = "127.0.0.1";
  let connectionString = "";
  let dbName = "";
  let host = "";
  let licenseKeyConfigured = false;
  const resources: string[] = [];
  let framework = t("Desconocido");
  let game: "fivem" | "redm" = "fivem";

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith("#") || line.startsWith("//")) continue;

    const hostnameMatch = line.match(/(?:set\s+)?sv_hostname\s+["']?([^"']+)["']?/i);
    if (hostnameMatch) {
      name = hostnameMatch[1].replace(/\^[0-9A-Za-z]/g, '').trim();
    }

    const maxClientsMatch = line.match(/(?:set\s+)?sv_maxclients\s+["']?(\d+)["']?/i);
    if (maxClientsMatch) {
      maxClients = parseInt(maxClientsMatch[1], 10);
    }

    const endpointMatch = line.match(/endpoint_add_tcp\s+["']?([^"':]+):(\d+)["']?/i);
    if (endpointMatch) {
      ip = endpointMatch[1] === "0.0.0.0" ? "127.0.0.1" : endpointMatch[1];
      port = parseInt(endpointMatch[2], 10);
    }

    const mysqlMatch = line.match(/(?:set\s+|setr\s+)?mysql_connection_string\s+["']?([^"']+)["']?/i);
    if (mysqlMatch) {
      connectionString = mysqlMatch[1];
      const dbMatch = connectionString.match(/database=([^;&]+)/i) || connectionString.match(/\/([^?;&]+)$/);
      if (dbMatch) dbName = dbMatch[1];
      const hostMatch = connectionString.match(/host=([^;&]+)/i) || connectionString.match(/@([^/:;&]+)/);
      if (hostMatch) host = hostMatch[1];
    }

    if (line.match(/(?:set\s+)?sv_licenseKey\s+["']?([^"'\s]+)["']?/i)) {
      licenseKeyConfigured = true;
    }

    const gamenameMatch = line.match(/(?:set\s+)?gamename\s+["']?([a-z0-9]+)["']?/i);
    if (gamenameMatch && gamenameMatch[1].toLowerCase() === "rdr3") {
      game = "redm";
    }

    const resourceMatch = line.match(/^(?:ensure|start)\s+([^\s#]+)/i);
    if (resourceMatch) {
      const resName = resourceMatch[1];
      resources.push(resName);
      if (resName.includes("qb-core")) framework = "QBCore Framework";
      else if (resName.includes("es_extended")) framework = "ESX Legacy Framework";
      else if (resName.includes("ox_core")) framework = "OX Core Framework";
    }
  }

  if (framework === "Desconocido" && resources.length > 0) {
    framework = t("Custom / Standalone");
  }

  return {
    name: name || t("FiveM Server"),
    maxClients,
    port,
    ip: `${ip}:${port}`,
    database: {
      connected: !!connectionString,
      connectionString,
      dbName: dbName || "fivem",
      host: host || "localhost"
    },
    licenseKeyConfigured,
    resources,
    framework,
    game,
    rawContent: cfgContent
  };
}
