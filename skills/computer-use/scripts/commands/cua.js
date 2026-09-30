import { CliError } from '../errors.js';
export const defaultLoadCuaDriver = async () => {
    try {
        const mod = (await import('@trycua/cua-driver'));
        return mod.CuaDriver.create(undefined);
    }
    catch {
        throw new CliError('ENOTSUPPORTED', 'Cua Driver SDK is unavailable — install @trycua/cua-driver (npm, with the platform native package) or fall back to the core/mado commands');
    }
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
    const raw = (await driver.callTool(action, JSON.stringify(args)));
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
