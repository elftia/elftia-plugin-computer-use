import { maybeAfterShot } from './shot.js';
export async function runScroll(inv, deps) {
    await deps.backend.sendInput({
        kind: 'scroll',
        x: inv.x,
        y: inv.y,
        direction: inv.direction,
        amount: inv.amount,
    });
    const after = await maybeAfterShot(deps, inv);
    const payload = {
        ok: true,
        action: 'scroll',
        x: inv.x,
        y: inv.y,
        direction: inv.direction,
        amount: inv.amount,
    };
    if (after !== undefined) {
        payload.after = after;
    }
    return payload;
}
