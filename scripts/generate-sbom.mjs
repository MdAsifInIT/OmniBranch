/* global console, process */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const dependencies = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, version]) => ({
    type: 'library',
    name,
    version,
    purl: `pkg:npm/${encodeURIComponent(name)}@${version}`,
  }));
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: 'urn:uuid:00000000-0000-4000-8000-000000000010',
  version: 1,
  metadata: { component: { type: 'application', name: 'omnibranch', version: manifest.version } },
  components: dependencies,
};
await mkdir(path.join(root, 'artifacts'), { recursive: true });
await writeFile(
  path.join(root, 'artifacts', `omnibranch-${manifest.version}.sbom.json`),
  `${JSON.stringify(sbom, null, 2)}\n`,
);
console.log(JSON.stringify({ ok: true, components: dependencies.length }));
