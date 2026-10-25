import net from 'net';
import os from 'os';
import { execFile } from 'child_process';
import { tr } from './idioma';

export type RequirementStatus = 'ok' | 'missing' | 'unknown';

export interface Requirement {
  id: string;
  label: string;
  status: RequirementStatus;
  required: boolean;
  detail: string;
  fix?: { label: string; url?: string; hint?: string };
}

const MYSQL_PORT = 3306;
const PROBE_TIMEOUT_MS = 700;

function portIsOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
    socket.on('timeout', () => done(false));
  });
}

function vcRedistInstalled(): Promise<boolean | null> {
  if (os.platform() !== 'win32') return Promise.resolve(null);

  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64', '/v', 'Installed'],
      { windowsHide: true, timeout: 4000 },
      (error, stdout) => {
        if (error) return resolve(false);
        resolve(/Installed\s+REG_DWORD\s+0x1/i.test(stdout));
      }
    );
  });
}

export interface RequirementsInput {
  findFxServerBinary: () => string | null;
  serverCfgPaths: { cfgPath: string }[];
}

export async function checkRequirements(input: RequirementsInput): Promise<Requirement[]> {
  const requirements: Requirement[] = [];

  let fxBinary: string | null = null;
  try {
    fxBinary = input.findFxServerBinary();
  } catch {
    fxBinary = null;
  }

  requirements.push({
    id: 'fxserver',
    label: 'FXServer',
    required: true,
    status: fxBinary ? 'ok' : 'missing',
    detail: fxBinary
      ? fxBinary
      : tr('No se ha encontrado el ejecutable de FXServer (el mismo sirve para FiveM y RedM) en las rutas habituales.'),
    fix: fxBinary
      ? undefined
      : {
          label: tr('Descargar artifacts de Cfx.re (FiveM/RedM)'),
          url: 'https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/',
          hint: tr('Si ya lo tienes instalado en otra ruta, indícala en Ajustes → Rutas o da de alta el servidor con su server.cfg.'),
        },
  });

  const cfgCount = input.serverCfgPaths.length;
  requirements.push({
    id: 'server-cfg',
    label: tr('Configuración del servidor (server.cfg)'),
    required: true,
    status: cfgCount > 0 ? 'ok' : 'missing',
    detail:
      cfgCount > 0
        ? `${cfgCount} encontrado(s): ${input.serverCfgPaths.map((s) => s.cfgPath).join(', ')}`
        : tr('No se ha detectado ningún server.cfg en las rutas habituales.'),
    fix:
      cfgCount > 0
        ? undefined
        : {
            label: tr('Indicar la ruta manualmente'),
            hint: tr('En el siguiente paso puedes escribir la ruta de tu server.cfg si está en una carpeta que no es de las habituales.'),
          },
  });

  const vc = await vcRedistInstalled();
  if (vc !== null) {
    requirements.push({
      id: 'vcredist',
      label: tr('Visual C++ 2015-2022 (x64)'),
      required: true,
      status: vc ? 'ok' : 'missing',
      detail: vc
        ? tr('Instalado.')
        : 'FXServer no arranca sin este runtime —ni en FiveM ni en RedM—; el error que da no lo explica.',
      fix: vc
        ? undefined
        : {
            label: tr('Descargar de Microsoft'),
            url: 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
          },
    });
  }

  const mysqlUp = await portIsOpen(MYSQL_PORT);
  requirements.push({
    id: 'mysql',
    label: tr('MySQL / MariaDB'),
    required: false,
    status: mysqlUp ? 'ok' : 'missing',
    detail: mysqlUp
      ? tr('Respondiendo en 127.0.0.1:{MYSQL_PORT}.', { MYSQL_PORT })
      : tr('Nada escuchando en 127.0.0.1:{MYSQL_PORT}. La sección Base de datos no funcionará.', { MYSQL_PORT }),
    fix: mysqlUp
      ? undefined
      : {
          label: tr('Descargar MariaDB'),
          url: 'https://mariadb.org/download/',
          hint: tr('Si tu base de datos está en otra máquina o en otro puerto, ignora este aviso: se configura desde la sección Base de datos.'),
        },
  });

  return requirements;
}
