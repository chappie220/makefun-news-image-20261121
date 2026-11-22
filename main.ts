import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Publish the artwork authored for this competition without network access.
const root = dirname(fileURLToPath(import.meta.url));
const artwork = readFileSync(join(root, 'entry.png'));
if (artwork.length > 1_048_576) throw new Error('Artwork exceeds 1 MiB');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (!artwork.subarray(0, 8).equals(signature)) throw new Error('Expected PNG artwork');
if (artwork.length < 33) throw new Error('Truncated PNG');
const width = artwork.readUInt32BE(16);
const height = artwork.readUInt32BE(20);
if (width !== 1024 || height !== 1024) throw new Error('Expected 1024 × 1024 artwork');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let offset = 8;
let ended = false;
let hasData = false;
while (offset < artwork.length) {
  if (offset + 12 > artwork.length) throw new Error('Truncated chunk');
  const length = artwork.readUInt32BE(offset);
  const end = offset + 12 + length;
  if (end > artwork.length) throw new Error('Truncated chunk payload');
  const kind = artwork.toString('ascii', offset + 4, offset + 8);
  if (offset === 8 && (kind !== 'IHDR' || length !== 13)) throw new Error('Invalid IHDR');
  const actual = crc32(artwork.subarray(offset + 4, end - 4));
  if (actual !== artwork.readUInt32BE(end - 4)) throw new Error(`Invalid ${kind} CRC`);
  if (kind === 'IDAT') hasData = true;
  offset = end;
  if (kind === 'IEND') {
    if (length !== 0 || offset !== artwork.length) throw new Error('Invalid PNG end');
    ended = true;
    break;
  }
}
if (!ended || !hasData) throw new Error('Incomplete PNG');
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(output, { recursive: true });
// Replace the destination only after the complete validated image is written.
const pending = join(output, 'entry.png.pending');
writeFileSync(pending, artwork);
renameSync(pending, join(output, 'entry.png'));
