import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

export function zipEntryPath(name: string): string {
  return name.replace(/\\/g, '/');
}

export function readZipEntryNames(file: string): string[] | null {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tail = Buffer.alloc(Math.min(size, 22 + 0xffff));
    fs.readSync(fd, tail, 0, tail.length, size - tail.length);

    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) return null;

    const count = tail.readUInt16LE(end + 10);
    const dirSize = tail.readUInt32LE(end + 12);
    const dirOffset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || dirOffset === 0xffffffff) return null;
    if (dirSize > 16 * 1024 * 1024 || dirOffset + dirSize > size) return null;

    const dir = Buffer.alloc(dirSize);
    fs.readSync(fd, dir, 0, dirSize, dirOffset);

    const names: string[] = [];
    let at = 0;
    for (let n = 0; n < count; n++) {
      if (at + 46 > dir.length || dir.readUInt32LE(at) !== 0x02014b50) return null;
      const utf8 = (dir.readUInt16LE(at + 8) & 0x800) !== 0;
      const nameLength = dir.readUInt16LE(at + 28);
      const next = at + 46 + nameLength + dir.readUInt16LE(at + 30) + dir.readUInt16LE(at + 32);
      if (next > dir.length) return null;
      names.push(dir.subarray(at + 46, at + 46 + nameLength).toString(utf8 ? 'utf8' : 'latin1'));
      at = next;
    }
    return names;
  } finally {
    fs.closeSync(fd);
  }
}

export async function extractZipSkippingRoot(
  zip: string | AdmZip,
  dest: string,
  skipRoot: boolean
): Promise<void> {
  const entries = (typeof zip === 'string' ? new AdmZip(zip) : zip).getEntries();
  if (entries.length === 0) throw new Error('El zip llegó vacío.');

  const rootDir = skipRoot
    ? (zipEntryPath(entries.find((e) => !e.isDirectory)?.entryName ?? '').split('/')[0] || null)
    : null;

  for (const entry of entries) {
    let name = zipEntryPath(entry.entryName);
    if (rootDir && name.startsWith(rootDir + '/')) name = name.slice(rootDir.length + 1);
    if (!name) continue;

    const full = path.join(dest, name);
    if (!isInside(dest, full)) continue;

    if (entry.isDirectory) {
      fs.mkdirSync(full, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      await fs.promises.writeFile(full, entry.getData());
    }
  }
}
