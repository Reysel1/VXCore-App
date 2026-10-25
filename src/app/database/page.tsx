"use client";

import React, { useState, useEffect, useCallback, useEffectEvent, useRef } from "react";
import { AGENT_URL } from "@/lib/agent";
import {
  Database,
  Search,
  Table2,
  Play,
  Download,
  CheckCircle2,
  AlertCircle,
  Terminal,
  RefreshCw,
  Settings2,
  PlugZap
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useServerContext } from "@/context/server-context";
import { t } from "@/i18n";

interface TableInfo {
  name: string;
  rows: number;
  engine: string;
  dataLength: number;
  collation: string;
}

type Row = Record<string, unknown>;

interface DbTestResponse {
  success?: boolean;
  message?: string;
  details?: { version?: string; currentDb?: string };
}

interface DbTablesResponse {
  success?: boolean;
  tables?: TableInfo[];
  error?: string;
}

interface DbQueryResponse {
  success?: boolean;
  type?: string;
  rows?: Row[];
  columns?: string[];
  rowCount?: number;
  affectedRows?: number;
  executionTimeMs?: number;
  error?: string;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function databaseOf(database: string | undefined): string | undefined {
  return database && database !== "oxmysql" ? database : undefined;
}

export default function DatabasePage() {
  const { activeServer } = useServerContext();

  const [dbHost, setDbHost] = useState("127.0.0.1");
  const [dbPort, setDbPort] = useState("3306");
  const [dbUser, setDbUser] = useState("root");
  const [dbPassword, setDbPassword] = useState("");
  const [dbDatabase, setDbDatabase] = useState(() => databaseOf(activeServer?.database) ?? "fivem_db");
  const [connectionString, setConnectionString] = useState(() => activeServer?.dbConnection || "");

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [tableRows, setTableRows] = useState<Row[]>([]);
  const [activeColumns, setActiveColumns] = useState<string[]>([]);

  const [sqlQuery, setSqlQuery] = useState<string>("SELECT * FROM players LIMIT 50;");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [connMessage, setConnMessage] = useState<string | null>(null);
  const [executionNotice, setExecutionNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [serverDb, setServerDb] = useState({
    connection: activeServer?.dbConnection,
    database: activeServer?.database,
  });
  if (serverDb.connection !== activeServer?.dbConnection || serverDb.database !== activeServer?.database) {
    setServerDb({ connection: activeServer?.dbConnection, database: activeServer?.database });
    if (activeServer?.dbConnection) setConnectionString(activeServer.dbConnection);
    const database = databaseOf(activeServer?.database);
    if (database) setDbDatabase(database);
  }

  const getDbPayload = useCallback(() => {
    if (connectionString.trim()) {
      return { connectionString: connectionString.trim() };
    }
    return {
      host: dbHost.trim() || "127.0.0.1",
      port: Number(dbPort) || 3306,
      user: dbUser.trim() || "root",
      password: dbPassword,
      database: dbDatabase.trim() || "fivem_db",
    };
  }, [connectionString, dbHost, dbPort, dbUser, dbPassword, dbDatabase]);

  const loadTableData = useCallback(async (tblName: string) => {
    setSelectedTable(tblName);
    const query = `SELECT * FROM \`${tblName}\` LIMIT 50;`;
    setSqlQuery(query);
    setIsExecuting(true);
    setErrorMessage(null);

    try {
      const queryRes = await fetch(`${AGENT_URL}/api/db/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...getDbPayload(), query }),
      });
      const queryData: DbQueryResponse = await queryRes.json();
      if (queryData.success && Array.isArray(queryData.rows)) {
        setTableRows(queryData.rows);
        setActiveColumns(queryData.columns || Object.keys(queryData.rows[0] || {}));
        setExecutionNotice(t("50 filas cargadas de `{tblName}` ({executionTimeMs}ms)", { tblName, executionTimeMs: queryData.executionTimeMs }));
        setTimeout(() => setExecutionNotice(null), 3000);
      } else if (queryData.error) {
        setErrorMessage(queryData.error);
      }
    } catch (err) {
      setErrorMessage(t("Error ejecutando consulta: {message}", { message: errorText(err) }));
    } finally {
      setIsExecuting(false);
    }
  }, [getDbPayload]);

  const fetchTables = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/db/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getDbPayload()),
      });
      const data: DbTablesResponse = await res.json();
      if (data.success && Array.isArray(data.tables)) {
        setTables(data.tables ?? []);
        setIsConnected(true);
        if (data.tables.length > 0 && !selectedTable) {
          const first = data.tables[0].name;
          setSelectedTable(first);
          loadTableData(first);
        }
      } else {
        setIsConnected(false);
        if (data.error) setErrorMessage(t("Error listando tablas: {error}", { error: data.error }));
      }
    } catch (err) {
      console.log("Error buscando tablas:", errorText(err));
    } finally {
      setIsLoading(false);
    }
  }, [getDbPayload, selectedTable, loadTableData]);

  const handleTestConnection = async () => {
    setIsLoading(true);
    setConnMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`${AGENT_URL}/api/db/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getDbPayload()),
      });
      const data: DbTestResponse = await res.json();
      if (data.success) {
        setIsConnected(true);
        setConnMessage(t("Conectado a MySQL {valor} (Base de datos: {valor2})", { valor: data.details?.version || "", valor2: data.details?.currentDb || dbDatabase }));
        fetchTables();
      } else {
        setIsConnected(false);
        setErrorMessage(data.message || t("Error al conectar con la base de datos."));
      }
    } catch (err) {
      setIsConnected(false);
      setErrorMessage(t("No se pudo contactar al agente VXCore en {AGENT_URL}: {message}", { AGENT_URL, message: errorText(err) }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteQuery = async () => {
    if (!sqlQuery.trim()) return;
    setIsExecuting(true);
    setErrorMessage(null);
    setExecutionNotice(null);

    try {
      const res = await fetch(`${AGENT_URL}/api/db/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...getDbPayload(), query: sqlQuery }),
      });
      const data: DbQueryResponse = await res.json();
      if (data.success) {
        if (data.type === "select" && Array.isArray(data.rows)) {
          setTableRows(data.rows ?? []);
          setActiveColumns(data.columns || Object.keys(data.rows[0] || {}));
          setExecutionNotice(t("Consulta SELECT ejecutada con éxito. {rowCount} resultado(s) ({executionTimeMs}ms)", { rowCount: data.rowCount, executionTimeMs: data.executionTimeMs }));
        } else {
          setExecutionNotice(t("Consulta ejecutada: {valor} fila(s) afectadas ({executionTimeMs}ms)", { valor: data.affectedRows ?? 0, executionTimeMs: data.executionTimeMs }));
          fetchTables();
        }
        setTimeout(() => setExecutionNotice(null), 4000);
      } else {
        setErrorMessage(data.error || t("Error al ejecutar la consulta SQL."));
      }
    } catch (err) {
      setErrorMessage(t("Error de conexión al agente: {message}", { message: errorText(err) }));
    } finally {
      setIsExecuting(false);
    }
  };

  const autoConnectedRef = useRef(false);
  const autoConnect = useEffectEvent(() => {
    void handleTestConnection();
  });
  useEffect(() => {
    if (!connectionString.trim()) return;
    if (autoConnectedRef.current) return;

    autoConnectedRef.current = true;
    autoConnect();
  }, [connectionString]);

  const handleExportCSV = () => {
    if (tableRows.length === 0 || activeColumns.length === 0) return;
    const headers = activeColumns.join(",");
    const rows = tableRows.map(row =>
      activeColumns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '""';
        if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(",")
    ).join("\n");
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${selectedTable || "query_result"}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRows = tableRows.filter(row => {
    if (!searchFilter.trim()) return true;
    const term = searchFilter.toLowerCase();
    return Object.values(row).some(val => {
      if (val === null || val === undefined) return false;
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return str.toLowerCase().includes(term);
    });
  });

  return (
    <div className="flex h-full min-h-0 w-full bg-background rounded-xl border border-border/50 shadow-sm overflow-hidden">
      <div className="w-72 border-r border-border/50 bg-muted/10 flex flex-col shrink-0 min-h-0">
        <div className="p-4 border-b border-border/50">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Database className="size-5 text-blue-500 shrink-0" />
              <div className="min-w-0">
                <h3 className="font-bold text-sm truncate font-mono">{dbDatabase || activeServer?.database || "fivem_db"}</h3>
                <p className="text-[11px] text-muted-foreground truncate">{dbHost}:{dbPort}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setIsSettingsOpen(true)} title={t("Configurar conexión")}>
              <Settings2 className="size-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2">
            {isConnected === null ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/40 text-muted-foreground text-xs border border-border/60">
                <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                <span>{t("Sin conectar")}</span>
              </div>
            ) : isConnected ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{t("MySQL Conectado")}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 text-red-400 text-xs border border-red-500/20">
                <span className="size-1.5 rounded-full bg-red-500" />
                <span>{t("Desconectado")}</span>
              </div>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={fetchTables} disabled={isLoading}>
              <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
              {t("Recargar")}
            </Button>
          </div>
        </div>

        <div className="p-3 border-b border-border/50">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between mb-2">
            <span>{t("Tablas ({length})", { length: tables.length })}</span>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2 space-y-1">
            {tables.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground space-y-2">
                <p>{t("No se han detectado tablas o la conexión no se ha establecido.")}</p>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setIsSettingsOpen(true)}>
                  <PlugZap className="size-3" />
                  {t("Configurar DB")}
                </Button>
              </div>
            ) : (
              tables.map((table) => {
                const isSelected = selectedTable === table.name;
                return (
                  <button
                    key={table.name}
                    onClick={() => loadTableData(table.name)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Table2 className={`size-3.5 shrink-0 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`} />
                      <span className="truncate font-mono">{table.name}</span>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] h-4.5 px-1.5 ${
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground border-none"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {table.rows.toLocaleString()}
                    </Badge>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-background/50">
        <div className="border-b border-border/50 p-4 bg-muted/5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-primary" />
              <span className="text-sm font-semibold">{t("Consola SQL en Vivo")}</span>
              <span className="text-xs text-muted-foreground font-mono">({dbDatabase || "fivem_db"})</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleExecuteQuery}
                disabled={isExecuting}
                className="h-8 gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
              >
                <Play className="size-3.5 fill-current" />
                {isExecuting ? t("Ejecutando...") : t("Ejecutar Consulta")}
              </Button>
            </div>
          </div>

          <div className="relative">
            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder={t("Escribe tu consulta SQL aquí (ej: SELECT * FROM players WHERE bank > 50000;)")}
              rows={2}
              className="w-full font-mono text-xs p-3 rounded-lg bg-background border border-border/60 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
            />
          </div>

          {executionNotice && (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="size-3.5 shrink-0" />
              <span>{executionNotice}</span>
            </div>
          )}

          {errorMessage && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <div className="p-3 border-b border-border/50 flex items-center justify-between gap-4 bg-muted/10">
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
              <Input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={t("Filtrar datos en los resultados...")}
                className="h-8 pl-8 text-xs bg-background/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs h-7 font-mono">
              {t("{length} fila(s)", { length: filteredRows.length })}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-8 text-xs gap-1.5">
              <Download className="size-3.5" />
              {t("Exportar CSV")}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto bg-background">
          {activeColumns.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center gap-2">
              <Table2 className="size-12 stroke-[1.2] opacity-30" />
              <p className="text-sm font-medium">{t("Selecciona una tabla o ejecuta una consulta SQL")}</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {t("Las filas y columnas se cargarán directamente desde tu base de datos MySQL en tiempo real.")}
              </p>
            </div>
          ) : (
            <div className="min-w-full inline-block align-middle">
              <table className="w-full text-xs text-left border-collapse font-mono">
                <thead className="bg-muted/40 border-b border-border/60 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    {activeColumns.map((col) => (
                      <th key={col} className="p-2.5 font-semibold text-foreground/80 border-r border-border/40 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{col}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={activeColumns.length} className="p-8 text-center text-muted-foreground">
                        {t("No se encontraron filas que coincidan con el filtro.")}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                        {activeColumns.map((col, cIdx) => {
                          const val = row[col];
                          const displayVal = val === null ? (
                            <span className="text-muted-foreground/50 italic">NULL</span>
                          ) : typeof val === 'object' ? (
                            <span className="text-amber-400 font-mono">{JSON.stringify(val)}</span>
                          ) : (
                            String(val)
                          );
                          return (
                            <td key={cIdx} className="p-2.5 border-r border-border/30 whitespace-nowrap max-w-[300px] truncate">
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="size-5 text-blue-500" />
              {t("Configurar Conexión MySQL / MariaDB")}
            </DialogTitle>
            <DialogDescription>
              {t("Introduce los parámetros de tu servidor de base de datos MySQL (oxmysql, ghmattimysql, XAMPP o remoto).")}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-foreground">{t("Host / IP")}</label>
                <Input value={dbHost} onChange={(e) => setDbHost(e.target.value)} placeholder="127.0.0.1" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">{t("Puerto")}</label>
                <Input value={dbPort} onChange={(e) => setDbPort(e.target.value)} placeholder="3306" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">{t("Usuario")}</label>
                <Input value={dbUser} onChange={(e) => setDbUser(e.target.value)} placeholder="root" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">{t("Contraseña")}</label>
                <Input type="password" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">{t("Nombre de Base de Datos")}</label>
              <Input value={dbDatabase} onChange={(e) => setDbDatabase(e.target.value)} placeholder="qbcoreframework_f893d1 o fivem_db" />
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border/50">
              <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span>{t("O Cadena de Conexión (Connection String)")}</span>
              </label>
              <Input
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                placeholder="mysql://root:pass@127.0.0.1:3306/fivem_db o user=root;database=fivem_db"
                className="font-mono text-xs"
              />
            </div>

            {connMessage && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{connMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleTestConnection} disabled={isLoading} className="gap-2">
              <PlugZap className="size-4" />
              {isLoading ? t("Probando...") : t("Probar Conexión")}
            </Button>
            <Button onClick={() => { handleTestConnection(); setIsSettingsOpen(false); }}>
              {t("Guardar y Conectar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
