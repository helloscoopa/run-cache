// Copies the ESM type declarations next to the ESM build (see src/index.d.mts).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
fs.copyFileSync(path.join(root, 'src', 'index.d.mts'), path.join(root, 'dist', 'index.d.mts'));
