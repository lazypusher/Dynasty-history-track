#!/usr/bin/env node
// Minimal asar reader: list | cat <path> | extract <prefix> <destDir>
const fs = require('fs');
const path = require('path');

const ARCHIVE = process.argv[2];
const cmd = process.argv[3];

function readHeader(archive) {
  const fd = fs.openSync(archive, 'r');
  const sizeBuf = Buffer.alloc(8);
  fs.readSync(fd, sizeBuf, 0, 8, 0);
  const headerPickleSize = sizeBuf.readUInt32LE(4);
  const headerBuf = Buffer.alloc(headerPickleSize);
  fs.readSync(fd, headerBuf, 0, headerPickleSize, 8);
  // pickle: first 4 bytes = payload size, then string length
  const strLen = headerBuf.readUInt32LE(4);
  const json = headerBuf.toString('utf8', 8, 8 + strLen);
  fs.closeSync(fd);
  return { header: JSON.parse(json), baseOffset: 8 + headerPickleSize };
}

function walk(node, prefix, out) {
  for (const [name, child] of Object.entries(node.files || {})) {
    const p = prefix ? prefix + '/' + name : name;
    if (child.files) walk(child, p, out);
    else out.push({ path: p, size: child.size, offset: child.offset, unpacked: !!child.unpacked, link: child.link });
  }
  return out;
}

const { header, baseOffset } = readHeader(ARCHIVE);
const entries = walk(header, '', []);

if (cmd === 'list') {
  const needle = process.argv[4] || '';
  const max = parseInt(process.argv[5] || '400', 10);
  const rows = entries.filter(e => e.path.includes(needle));
  console.log(`total files: ${entries.length}, matched: ${rows.length}`);
  for (const r of rows.slice(0, max)) console.log(`${(r.size ?? 0).toString().padStart(9)}  ${r.path}${r.unpacked ? '  [unpacked]' : ''}`);
} else if (cmd === 'cat') {
  const target = process.argv[4];
  const e = entries.find(x => x.path === target);
  if (!e) { console.error('not found: ' + target); process.exit(2); }
  const fd = fs.openSync(ARCHIVE, 'r');
  const buf = Buffer.alloc(e.size);
  fs.readSync(fd, buf, 0, e.size, baseOffset + Number(e.offset));
  fs.closeSync(fd);
  process.stdout.write(buf);
} else if (cmd === 'extract') {
  const prefix = process.argv[4] || '';
  const dest = process.argv[5] || '.asar-extract';
  const rows = entries.filter(e => e.path.startsWith(prefix));
  let n = 0;
  const fd = fs.openSync(ARCHIVE, 'r');
  for (const r of rows) {
    const outPath = path.join(dest, r.path);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (r.unpacked) { console.log('skip unpacked ' + r.path); continue; }
    const buf = Buffer.alloc(r.size);
    fs.readSync(fd, buf, 0, r.size, baseOffset + Number(r.offset));
    fs.writeFileSync(outPath, buf);
    n++;
  }
  fs.closeSync(fd);
  console.log(`extracted ${n} files to ${dest}`);
} else {
  console.error('usage: asar.js <archive> list|cat|extract ...');
  process.exit(1);
}
