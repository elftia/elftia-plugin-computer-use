import { maybeAfterShot } from './shot.js';
export async function runDrag(inv, deps) {
    await deps.backend.sendInput({
        kind: 'drag',
        fromX: inv.fromX,
        fromY: inv.fromY,
        toX: inv.toX,
        toY: inv.toY,
    });
    const after = await maybeAfterShot(deps, inv);
    const payload = {
        ok: true,
        action: 'drag',
        from: { x: inv.fromX, y: inv.fromY },
        to: { x: inv.toX, y: inv.toY },
    };
    if (after !== undefined) {
        payload.after = after;
    }
    return payload;
}
