/**
 * Guards the package.json `exports` map: ESM and CommonJS entry points get their own
 * type declarations, and existing deep imports into dist/ keep resolving.
 */
import * as fs from 'fs';
import * as path from 'path';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

describe('package exports', () => {
  it('serves ESM and CommonJS entry points with matching type declarations', () => {
    expect(pkg.exports['.']).toEqual({
      import: { types: './dist/index.d.mts', default: './dist/index.mjs' },
      require: { types: './dist/index.d.ts', default: './dist/index.js' },
    });
    expect(pkg.module).toBe('dist/index.mjs');
    expect(pkg.main).toBe('dist/index.js');
  });

  it('keeps extensionless and directory deep imports working', () => {
    expect(pkg.exports['./dist/*']).toBe('./dist/*.js');
    expect(pkg.exports['./dist/*.js']).toBe('./dist/*.js');
    expect(pkg.exports['./dist/storage']).toBe('./dist/storage/index.js');
  });

  it('declares the RunCache class as the default export of the ESM build', () => {
    const declarations = fs.readFileSync(path.join(__dirname, 'index.d.mts'), 'utf8');
    expect(declarations).toMatch(/import \{ RunCache \} from '\.\/run-cache\.js';/);
    expect(declarations).toMatch(/export \* from '\.\/index\.js';/);
    expect(declarations).toMatch(/export default RunCache;/);
  });
});
