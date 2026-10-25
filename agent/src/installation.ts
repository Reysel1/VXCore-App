import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { tr } from './idioma';

const INSTALLATION_FILE = path.resolve(process.cwd(), 'installation.json');

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const ID_LENGTH = 16;

export interface Installation {
  id: string;
  name: string;
  createdAt: string;
}

function isValidId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === ID_LENGTH &&
    [...value].every((char) => ID_ALPHABET.includes(char))
  );
}

function generateId(): string {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)];
  }
  return id;
}

function defaultName(): string {
  const hostname = os.hostname().trim();
  return hostname ? hostname.slice(0, 60) : tr('Mi servidor');
}

let cache: Installation | null = null;

function persist(installation: Installation): boolean {
  try {
    fs.writeFileSync(INSTALLATION_FILE, JSON.stringify(installation, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[Installation] No se pudo guardar installation.json:', err);
    return false;
  }
}

export function getInstallation(): Installation {
  try {
    if (fs.existsSync(INSTALLATION_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(INSTALLATION_FILE, 'utf-8'));
      if (isValidId(parsed?.id)) {
        if (cache && cache.id !== parsed.id) {
          console.warn(
            `[Installation] Se recupera el id de disco (${parsed.id}); el provisional (${cache.id}) se descarta.`
          );
        }
        cache = {
          id: parsed.id,
          name:
            typeof parsed.name === 'string' && parsed.name.trim()
              ? parsed.name.trim()
              : defaultName(),
          createdAt:
            typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
        };

        return cache;
      }
      console.warn('[Installation] installation.json no tenía un id válido; se regenera.');
    }
  } catch (err) {
    console.error('[Installation] No se pudo leer installation.json:', err);
  }

  if (cache) {
    persist(cache);
    return cache;
  }

  const created: Installation = {
    id: generateId(),
    name: defaultName(),
    createdAt: new Date().toISOString(),
  };
  persist(created);
  cache = created;
  return created;
}
