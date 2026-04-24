const fs = require('fs');
const path = require('path');

const srcRoot = path.resolve(__dirname, '..', 'src');
const distRoot = path.resolve(__dirname, '..', 'dist');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const assetExts = new Set(['.svg', '.png', '.json']);

for (const file of walk(srcRoot)) {
  const ext = path.extname(file).toLowerCase();
  if (!assetExts.has(ext)) continue;
  const rel = path.relative(srcRoot, file);
  const dest = path.join(distRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
  process.stdout.write(`copied ${rel}\n`);
}
