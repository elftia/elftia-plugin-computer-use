import { join } from 'node:path';
import { ensureDir, resolveOutDir } from '../out-dir.js';
/**
 * Screenshot payload contract: `width`/`height` are the ACTUAL pixel dims of
 * the written PNG (after --window crop and --max-edge downsampling), never the
 * native screen dims.
 */
export async function runScreenshot(inv, deps) {
    const dir = ensureDir(resolveOutDir(deps, inv.out));
    const outPath = join(dir, 'screen.png');
    const captureOpts = { outPath, maxEdge: inv.maxEdge, region: inv.region };
    const img = inv.window !== undefined
        ? await deps.backend.captureWindow(inv.window, captureOpts)
        : await deps.backend.captureScreen(captureOpts);
    const payload = {
        ok: true,
        path: img.path,
        width: img.width,
        height: img.height,
    };
    if (inv.window !== undefined) {
        payload.window = inv.window;
    }
    return payload;
}
