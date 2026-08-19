import { maybeAfterShot } from './shot.js';
/**
 * UTF-8 text input via clipboard-paste (design D6): Set-Clipboard + Ctrl+V.
 * Documented side effect: the user's clipboard content is REPLACED.
 */
export async function runType(inv, deps) {
    await deps.backend.clipboardType(inv.text);
    const after = await maybeAfterShot(deps, inv);
    const payload = {
        ok: true,
        action: 'type',
        characters: Array.from(inv.text).length,
    };
    if (after !== undefined) {
        payload.after = after;
    }
    return payload;
}
