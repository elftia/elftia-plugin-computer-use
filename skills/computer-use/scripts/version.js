import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
function readVersion() {
    try {
        const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
export const VERSION = readVersion();
