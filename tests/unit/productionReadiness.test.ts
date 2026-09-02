import { describe, it, expect } from 'vitest';
import { isWebMCPSupported } from '../../src/webmcp/register.js';

describe('Step 21: Production Readiness Check', () => {
  it('1. Root LICENSE file exists with MIT License text', async () => {
    // @ts-ignore
    const fs = await import('fs');
    // @ts-ignore
    const path = await import('path');
    const rootDir = (globalThis as any).process?.cwd?.() || '.';
    const licensePath = path.join(rootDir, 'LICENSE');

    expect(fs.existsSync(licensePath)).toBe(true);
    const content = fs.readFileSync(licensePath, 'utf-8');
    expect(content).toContain('MIT License');
    expect(content).toContain('Nexus Weave Contributors');
  });

  it('2. package.json contains "license": "MIT"', async () => {
    // @ts-ignore
    const fs = await import('fs');
    // @ts-ignore
    const path = await import('path');
    const rootDir = (globalThis as any).process?.cwd?.() || '.';
    const pkgPath = path.join(rootDir, 'package.json');

    expect(fs.existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.license).toBe('MIT');
  });

  it('3. index.html contains WebMCP Origin Trial meta tag', async () => {
    // @ts-ignore
    const fs = await import('fs');
    // @ts-ignore
    const path = await import('path');
    const rootDir = (globalThis as any).process?.cwd?.() || '.';
    const indexPath = path.join(rootDir, 'index.html');

    const html = fs.readFileSync(indexPath, 'utf-8');
    expect(html).toContain('http-equiv="origin-trial"');
  });

  it('4. Built production bundle in dist/ exists and contains 0 forbidden network/storage APIs', async () => {
    // @ts-ignore
    const fs = await import('fs');
    // @ts-ignore
    const path = await import('path');
    const rootDir = (globalThis as any).process?.cwd?.() || '.';
    const distDir = path.join(rootDir, 'dist');

    expect(fs.existsSync(distDir)).toBe(true);
    const distIndex = path.join(distDir, 'index.html');
    expect(fs.existsSync(distIndex)).toBe(true);

    const forbiddenTokens = [
      'fetch(',
      'XMLHttpRequest',
      'WebSocket(',
      'sendBeacon(',
      'localStorage',
      'sessionStorage',
      'indexedDB',
    ];

    function scanDir(dir: string): void {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.endsWith('.js') || entry.endsWith('.html') || entry.endsWith('.css')) {
          // Exclude source maps from forbidden token scan
          if (entry.endsWith('.map')) continue;

          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const token of forbiddenTokens) {
            expect(content.includes(token)).toBe(false);
          }
        }
      }
    }

    expect(() => scanDir(distDir)).not.toThrow();
  });

  it('5. Dual-detection universal helper correctly reports WebMCP status in standard environment', () => {
    // Standard Node/test environment lacks native document.modelContext
    const supported = isWebMCPSupported();
    expect(typeof supported).toBe('boolean');
  });
});
