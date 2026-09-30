import { maybeAfterShot } from './shot.js';
export async function runKey(inv, deps) {
    await deps.backend.sendInput({
        kind: 'key',
        vk: inv.vk,
        extended: inv.extended,
        mods: inv.mods,
        ...(inv.holdMs === undefined ? {} : { holdMs: inv.holdMs }),
    });
    const after = await maybeAfterShot(deps, inv);
    const payload = {
        ok: true,
        action: 'key',
        combo: inv.combo,
        ...(inv.holdMs === undefined ? {} : { holdMs: inv.holdMs }),
    };
    if (after !== undefined) {
        payload.after = after;
    }
    return payload;
}
