import { join } from 'node:path';
import { ensureDir, resolveOutDir } from '../out-dir.js';
/**
 * `--shot` on action commands: capture a fresh screenshot after the action and
 * include it as an `after` reference (frozen payload discipline).
 */
export async function maybeAfterShot(deps, opts) {
    if (opts.shot !== true) {
        return undefined;
    }
    const dir = ensureDir(resolveOutDir(deps, opts.out));
    const img = await deps.backend.captureScreen({ outPath: join(dir, 'after.png') });
    return { path: img.path, width: img.width, height: img.height };
}
