import { readFileSync, writeFileSync } from 'node:fs';
import { CliError, errorMessage } from './errors.js';
function stripBom(text) {
    return text.replace(/^\uFEFF/, '');
}
export function writeState(filePath, state) {
    try {
        writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    }
    catch (err) {
        throw new CliError('EIO', `cannot write state file ${filePath}: ${errorMessage(err)}`);
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function expectNumber(value, where) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new CliError('EUSAGE', `state file field ${where} must be a finite number`);
    }
    return value;
}
function expectRect(value, where) {
    if (!isRecord(value)) {
        throw new CliError('EUSAGE', `state file field ${where} must be a bounds object`);
    }
    return {
        x: expectNumber(value.x, `${where}.x`),
        y: expectNumber(value.y, `${where}.y`),
        width: expectNumber(value.width, `${where}.width`),
        height: expectNumber(value.height, `${where}.height`),
    };
}
function validateState(parsed, filePath) {
    if (!isRecord(parsed)) {
        throw new CliError('EUSAGE', `state file ${filePath} is not a state object`);
    }
    if (parsed.schema !== 1) {
        throw new CliError('EUSAGE', `state file ${filePath} has unsupported schema ${String(parsed.schema)} (expected 1)`);
    }
    const screen = parsed.screen;
    const cursor = parsed.cursor;
    const activeWindow = parsed.activeWindow;
    const screenshot = parsed.screenshot;
    const elements = parsed.elements;
    if (!isRecord(screen) || !isRecord(cursor) || !isRecord(activeWindow) || !isRecord(screenshot) || !Array.isArray(elements)) {
        throw new CliError('EUSAGE', `state file ${filePath} is missing required fields (screen, cursor, activeWindow, screenshot, elements)`);
    }
    if (!isRecord(activeWindow.bounds)) {
        throw new CliError('EUSAGE', `state file ${filePath} activeWindow.bounds is missing`);
    }
    for (const [i, el] of elements.entries()) {
        if (!isRecord(el) || !isRecord(el.bounds) || !isRecord(el.center)) {
            throw new CliError('EUSAGE', `state file ${filePath} elements[${i}] is malformed`);
        }
    }
    const window = {
        id: expectNumber(activeWindow.id, 'activeWindow.id'),
        pid: expectNumber(activeWindow.pid, 'activeWindow.pid'),
        title: typeof activeWindow.title === 'string' ? activeWindow.title : '',
        appName: typeof activeWindow.appName === 'string' ? activeWindow.appName : '',
        bounds: expectRect(activeWindow.bounds, 'activeWindow.bounds'),
    };
    const normalizedElements = elements.map((raw, i) => {
        const el = raw;
        const bounds = expectRect(el.bounds, `elements[${i}].bounds`);
        return {
            index: expectNumber(el.index, `elements[${i}].index`),
            role: typeof el.role === 'string' ? el.role : '',
            name: typeof el.name === 'string' ? el.name : '',
            controlType: typeof el.controlType === 'string' ? el.controlType : '',
            bounds,
            center: {
                x: expectNumber(el.center.x, `elements[${i}].center.x`),
                y: expectNumber(el.center.y, `elements[${i}].center.y`),
            },
        };
    });
    return {
        schema: 1,
        createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : '',
        screen: {
            width: expectNumber(screen.width, 'screen.width'),
            height: expectNumber(screen.height, 'screen.height'),
        },
        cursor: {
            x: expectNumber(cursor.x, 'cursor.x'),
            y: expectNumber(cursor.y, 'cursor.y'),
        },
        activeWindow: window,
        screenshot: {
            path: typeof screenshot.path === 'string' ? screenshot.path : '',
            width: expectNumber(screenshot.width, 'screenshot.width'),
            height: expectNumber(screenshot.height, 'screenshot.height'),
        },
        elements: normalizedElements,
        elementsTruncated: parsed.elementsTruncated === true,
    };
}
export function readState(filePath) {
    let raw;
    try {
        raw = readFileSync(filePath, 'utf8');
    }
    catch (err) {
        throw new CliError('EUSAGE', `cannot read state file ${filePath}: ${errorMessage(err)}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(stripBom(raw));
    }
    catch {
        throw new CliError('EUSAGE', `state file ${filePath} is not valid JSON`);
    }
    return validateState(parsed, filePath);
}
export function findElement(state, index) {
    return state.elements.find((el) => el.index === index);
}
/** Windows parks minimized windows at (-32000, -32000). */
export function isMinimizedRect(rect) {
    return rect.x <= -30000 && rect.y <= -30000;
}
export function staleStateMessage(target) {
    return (`the state file's window (pid ${target.pid}, title "${target.title}") no longer matches ` +
        'the desktop — run "computer-use get-state" to capture a fresh state');
}
/**
 * Find the state window's live counterpart: prefer the same window handle,
 * fall back to the same pid AND title. Null means stale.
 */
export function findLiveWindow(apps, target) {
    const byId = apps.find((a) => a.id === target.id && a.pid === target.pid);
    if (byId !== undefined) {
        return byId;
    }
    const byPidTitle = apps.find((a) => a.pid === target.pid && a.title !== '' && a.title === target.title);
    return byPidTitle ?? null;
}
/**
 * Rescale a captured point against the window's LIVE bounds (design D7 /
 * Qwen's approach): the window may have moved or resized since capture.
 */
export function rescalePoint(stateBounds, liveBounds, point) {
    if (stateBounds.width <= 0 || stateBounds.height <= 0) {
        throw new CliError('ESTALE', 'state file window bounds are degenerate (zero size)');
    }
    const ratioX = liveBounds.width / stateBounds.width;
    const ratioY = liveBounds.height / stateBounds.height;
    return {
        x: Math.round(liveBounds.x + (point.x - stateBounds.x) * ratioX),
        y: Math.round(liveBounds.y + (point.y - stateBounds.y) * ratioY),
    };
}
