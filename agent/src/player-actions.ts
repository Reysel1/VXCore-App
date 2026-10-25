import fs from 'fs';
import path from 'path';
import { consoleText } from './console-text';
import { tr, trMsg } from './idioma';

export interface PlayerActionDef {
  key: string;
  label: string;
  kind: 'command' | 'event';
  event?: string;
  command?: string;
  payload?: string;
  hint?: string;
}

const EVENTS_CONFIG_FILE = path.resolve(process.cwd(), 'events-config.json');

const DEFAULT_PLAYER_ACTIONS: PlayerActionDef[] = [
  {
    key: 'revive',
    label: trMsg('Revivir y curar'),
    kind: 'command',
    command: 'revive {{id}}',
    hint: trMsg('Comando del framework (qb-adminmenu, esx_ambulancejob…). Cámbialo por el evento real en Editor → Eventos si el tuyo usa otro.'),
  },
  {
    key: 'heal',
    label: trMsg('Curar'),
    kind: 'command',
    command: 'sethealth {{id}} 200',
    hint: trMsg('Vuelve a poner la vida al máximo.'),
  },
  {
    key: 'armor',
    label: trMsg('Blindaje completo'),
    kind: 'command',
    command: 'setarmour {{id}} 100',
    hint: trMsg('Chaleco al máximo.'),
  },
  {
    key: 'kill',
    label: trMsg('Matar'),
    kind: 'command',
    command: 'sethealth {{id}} 0',
    hint: trMsg('Pone la vida a 0.'),
  },
  {
    key: 'tp',
    label: trMsg('Ir al jugador'),
    kind: 'command',
    command: 'tp {{id}}',
    hint: trMsg('Teletransporta al staff hasta el jugador.'),
  },
  {
    key: 'bring',
    label: trMsg('Traer jugador'),
    kind: 'command',
    command: 'bring {{id}}',
    hint: trMsg('Teletransporta al jugador hasta el staff.'),
  },
  {
    key: 'spectate',
    label: trMsg('Espectar'),
    kind: 'command',
    command: 'spectate {{id}}',
    hint: trMsg('Pone al staff en modo espectador sobre el jugador.'),
  },
  {
    key: 'announce',
    label: trMsg('Aviso en pantalla'),
    kind: 'event',
    event: 'vxcore:notify',
    payload: '{"source":{{id}},"title":"Aviso del staff","message":"Un administrador quiere hablar contigo.","type":"warning"}',
    hint: 'Aviso en la pantalla del jugador con los avisos de VXCore (evento vxcore:notify). Cambia "message" por lo que quieras decir; "type" puede ser info, success, warning o error.',
  },
];

export function loadPlayerActions(): PlayerActionDef[] {
  try {
    if (fs.existsSync(EVENTS_CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(EVENTS_CONFIG_FILE, 'utf-8'));
      if (Array.isArray(parsed.actions)) return parsed.actions;
    }
  } catch (err) {
    console.error('[Events] No se pudo leer events-config.json:', err);
  }
  return (JSON.parse(JSON.stringify(DEFAULT_PLAYER_ACTIONS)) as PlayerActionDef[]).map((a) => ({
    ...a,
    label: tr(a.label),
    ...(a.hint ? { hint: tr(a.hint) } : {}),
  }));
}

export function savePlayerActions(actions: PlayerActionDef[]): void {
  fs.writeFileSync(EVENTS_CONFIG_FILE, JSON.stringify({ actions }, null, 2), 'utf-8');
}

export function interpolateAction(template: string, player: Record<string, unknown>): string {
  return String(template)
    .replace(/\{\{\s*id\s*\}\}/gi, String(Number.parseInt(String(player.id ?? player.source ?? ''), 10) || ''))
    .replace(/\{\{\s*citizenid\s*\}\}/gi, consoleText(player.citizenid))
    .replace(/\{\{\s*name\s*\}\}/gi, consoleText(player.name))
    .replace(/\{\{\s*amount\s*\}\}/gi, String(Number(player.amount) || 0));
}
