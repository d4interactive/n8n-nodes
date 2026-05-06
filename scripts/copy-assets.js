const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const sourceDirs = ['credentials', 'nodes'];
const assetExts = new Set(['.svg', '.png', '.json']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

for (const sub of sourceDirs) {
  const root = path.join(projectRoot, sub);
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const ext = path.extname(file).toLowerCase();
    if (!assetExts.has(ext)) continue;
    const rel = path.relative(projectRoot, file);
    const dest = path.join(distRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
    process.stdout.write(`copied ${rel}\n`);
  }
}
