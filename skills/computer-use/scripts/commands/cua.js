import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CliError } from '../errors.js';
import { cuaArgsWantForeground, withForegroundNotice } from './foreground-notice.js';
function importFromNodeModules(nodeModulesDir) {
    // The SDK is ESM-only with a restrictive exports map, so resolve its entry
    // by reading package.json instead of require.resolve (CJS resolution).
    const pkgJson = join(nodeModulesDir, '@trycua', 'cua-driver', 'package.json');
    if (!existsSync(pkgJson))
        throw new Error('no package.json');
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
    const entry = pkg.main ?? './dist/index.js';
    const entryPath = join(nodeModulesDir, '@trycua', 'cua-driver', entry);
    if (!existsSync(entryPath))
        throw new Error('entry missing');
    return import(pathToFileURL(entryPath).href);
}
/**
 * Candidate `node_modules` roots for the SDK, in order:
 *  1. `ELFTIA_CUA_DRIVER_NODE_MODULES` (absolute override);
 *  2. `prebuilds/<platform>-<arch>/node_modules` in any ancestor directory of
 *     this file — the plugin packaging channel ships the SDK there, and the
 *     vendored CLI sits inside the same plugin tree (skills/…/scripts).
 * Bare `import('@trycua/cua-driver')` is tried first for repo/dev shapes
 * where node_modules sits beside the CLI scripts.
 */
export function candidateSdkNodeModules() {
    const platformDir = `prebuilds/${process.platform}-${process.arch}`;
    const roots = [];
    const override = process.env.ELFTIA_CUA_DRIVER_NODE_MODULES;
    if (override)
        roots.push(override);
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let depth = 0; depth < 12; depth += 1) {
        roots.push(join(dir, platformDir, 'node_modules'));
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return roots;
}
export const defaultLoadCuaDriver = async () => {
    const unavailable = new CliError('ENOTSUPPORTED', 'Cua Driver SDK is unavailable — install @trycua/cua-driver (npm, the plugin prebuilds channel, or ELFTIA_CUA_DRIVER_NODE_MODULES) or fall back to the core/mado commands');
    try {
        const mod = (await import('@trycua/cua-driver'));
        return mod.CuaDriver.create(undefined);
    }
    catch {
        /* fall through to the explicit-root candidates below */
    }
    for (const root of candidateSdkNodeModules()) {
        try {
            const mod = await importFromNodeModules(root);
            return mod.CuaDriver.create(undefined);
        }
        catch {
            /* try the next candidate root */
        }
    }
    throw unavailable;
};
/** Shared passthrough: one SDK tool call with a mandatory session label. */
export async function callCuaTool(driver, action, argsJson, defaultSession) {
    let args;
    if (argsJson === undefined) {
        args = {};
    }
    else {
        try {
            args = JSON.parse(argsJson);
        }
        catch {
            throw new CliError('EUSAGE', '--args must be a JSON object');
        }
        if (args === null || typeof args !== 'object' || Array.isArray(args)) {
            throw new CliError('EUSAGE', '--args must be a JSON object');
        }
    }
    // Window capture publication and element_token snapshots bind to the session
    // label; without one, capture paths fail with "capture binding is invalid".
    if (typeof args.session !== 'string' || args.session.trim() === '') {
        args.session = defaultSession;
    }
    const call = () => driver.callTool(action, JSON.stringify(args));
    // Foreground delivery takes over the user's real mouse/keyboard — wrap it
    // in the visibility notice (busy cursor + throttled tray toast).
    const raw = cuaArgsWantForeground(args)
        ? await withForegroundNotice(call)
        : await call();
    let structured;
    if (typeof raw.structuredJson === 'string' && raw.structuredJson !== '') {
        try {
            structured = JSON.parse(raw.structuredJson);
        }
        catch {
            structured = raw.structuredJson;
        }
    }
    const ok = raw.isError !== true;
    const payload = {
        ok,
        action,
        ...(ok ? {} : { errorCode: typeof raw.errorCode === 'string' && raw.errorCode !== '' ? raw.errorCode : 'EINPUT' }),
        ...(typeof raw.text === 'string' ? { text: raw.text } : {}),
        ...(structured === undefined ? {} : { structured }),
    };
    return payload;
}
export async function runCuaHealth(driver) {
    const meta = (await driver.metadata());
    let toolCount;
    try {
        const tools = JSON.parse(await driver.listToolsJson());
        if (Array.isArray(tools.tools))
            toolCount = tools.tools.length;
    }
    catch {
        toolCount = undefined;
    }
    return {
        ok: true,
        action: 'health',
        driverVersion: typeof meta.driverVersion === 'string' ? meta.driverVersion : null,
        contractVersion: typeof meta.contractVersion === 'string' ? meta.contractVersion : null,
        ...(toolCount === undefined ? {} : { toolCount }),
        native: true,
    };
}
export async function runCua(invocation, _deps, loadDriver = defaultLoadCuaDriver) {
    const driver = await loadDriver();
    try {
        if (invocation.action === 'health') {
            return await runCuaHealth(driver);
        }
        if (invocation.action === 'list-tools') {
            let tools;
            try {
                tools = JSON.parse(await driver.listToolsJson());
            }
            catch {
                throw new CliError('EBACKEND', 'Cua Driver returned an invalid tools list');
            }
            return { ok: true, action: 'list-tools', tools };
        }
        return await callCuaTool(driver, invocation.action, invocation.args, invocation.session);
    }
    finally {
        try {
            await driver.shutdown();
        }
        catch {
            /* shutdown is best-effort; the process is exiting anyway */
        }
    }
}
