/* global console, process */
import { Buffer } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const artifacts = path.join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });

const archives = [
  {
    source: path.join(root, 'skills', 'omnibranch'),
    output: path.join(artifacts, 'omnibranch-skill-0.2.1.tar.gz'),
    prefix: 'omnibranch',
    exclude: new Set(['generated']),
  },
  {
    source: path.join(root, 'distribution', 'claude-plugin'),
    output: path.join(artifacts, 'omnibranch-claude-plugin-0.2.1.tar.gz'),
    prefix: 'omnibranch-claude-plugin',
    exclude: new Set(),
  },
];

for (const archive of archives) {
  await rm(archive.output, { force: true });
  const files = await enumerate(archive.source, archive.exclude);
  const blocks = [];
  for (const relative of files) {
    const contents = await readFile(path.join(archive.source, relative));
    const archivePath = `${archive.prefix}/${relative.replaceAll('\\', '/')}`;
    blocks.push(
      tarHeader(archivePath, contents.byteLength, relative.endsWith('.mjs') ? 0o755 : 0o644),
    );
    blocks.push(contents);
    const remainder = contents.byteLength % 512;
    if (remainder !== 0) blocks.push(Buffer.alloc(512 - remainder));
  }
  blocks.push(Buffer.alloc(1024));
  await writeFile(archive.output, gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 }));
}
console.log(JSON.stringify({ ok: true, archives: archives.map((archive) => archive.output) }));

async function enumerate(directory, exclude) {
  const files = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (current === directory && exclude.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        await stat(absolute);
        files.push(path.relative(directory, absolute));
      } else throw new Error(`Unsupported archive entry: ${absolute}`);
    }
  }
  await visit(directory);
  return files;
}

function tarHeader(name, size, mode) {
  if (Buffer.byteLength(name) > 100) throw new Error(`Archive path exceeds ustar limit: ${name}`);
  const header = Buffer.alloc(512);
  field(header, 0, 100, name);
  octal(header, 100, 8, mode);
  octal(header, 108, 8, 0);
  octal(header, 116, 8, 0);
  octal(header, 124, 12, size);
  octal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  field(header, 257, 6, 'ustar');
  field(header, 263, 2, '00');
  field(header, 265, 32, 'root');
  field(header, 297, 32, 'root');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  const encoded = checksum.toString(8).padStart(6, '0');
  field(header, 148, 6, encoded);
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function field(buffer, offset, length, value) {
  buffer.write(value, offset, Math.min(length, Buffer.byteLength(value)), 'utf8');
}

function octal(buffer, offset, length, value) {
  field(buffer, offset, length, `${value.toString(8).padStart(length - 2, '0')}\0`);
}
