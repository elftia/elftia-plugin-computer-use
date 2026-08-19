import { join } from 'node:path';
import { ensureDir, resolveOutDir } from '../out-dir.js';
/**
 * Crop payload contract: `width`/`height` are the cropped PNG's ACTUAL dims;
 * `source` reports the input image's dims and path; `region` echoes the
 * requested rect in the SOURCE image's pixel frame.
 */
export async function runCrop(inv, deps) {
    const dir = ensureDir(resolveOutDir(deps, inv.out));
    const outPath = join(dir, 'crop.png');
    const result = await deps.backend.cropImage({
        sourcePath: inv.in,
        region: inv.region,
        outPath,
    });
    return {
        ok: true,
        action: 'crop',
        path: result.path,
        width: result.width,
        height: result.height,
        source: result.source,
        region: [inv.region.x1, inv.region.y1, inv.region.x2, inv.region.y2],
    };
}
