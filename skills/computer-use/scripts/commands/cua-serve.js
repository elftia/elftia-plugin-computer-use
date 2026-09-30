import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { CliError } from '../errors.js';
import { callCuaTool, defaultLoadCuaDriver, runCuaHealth } from './cua.js';
/**
 * Long-lived Cua Driver server: one shared SDK instance across many tool
 * calls, so snapshot ids and element_tokens stay valid for multi-step GUI
 * tasks (a one-shot process discards them on exit).
 *
 * Binds 127.0.0.1 with a random port and a bearer token; prints one startup
 * JSON object ({ok, url, token, pid}) to stdout, then serves POST /call,
 * GET /health and POST /shutdown until killed or shut down.
 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;
export function createServeDeps() {
    return { loadDriver: defaultLoadCuaDriver, stdout: process.stdout, processExit: (code) => process.exit(code) };
}
export function isLoopbackHost(host) {
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}
async function readBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.byteLength;
        if (size > MAX_BODY_BYTES)
            throw new CliError('EUSAGE', 'request body exceeds 8 MiB');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}
function respond(response, status, payload) {
    const body = JSON.stringify(payload);
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(`${body}\n`);
}
async function handleRequest(state, request, response) {
    const authorization = request.headers.authorization;
    if (authorization !== `Bearer ${state.token}`) {
        respond(response, 401, { ok: false, error: { code: 'EUSAGE', message: 'missing or invalid bearer token' } });
        return;
    }
    if (request.method === 'GET' && request.url === '/health') {
        respond(response, 200, await runCuaHealth(state.driver));
        return;
    }
    if (request.method === 'POST' && (request.url === '/call' || request.url === '/shutdown')) {
        const raw = await readBody(request);
        let body;
        try {
            body = raw === '' ? {} : JSON.parse(raw);
        }
        catch {
            respond(response, 400, { ok: false, error: { code: 'EUSAGE', message: 'body must be JSON' } });
            return;
        }
        const args = body.args;
        if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
            respond(response, 400, { ok: false, error: { code: 'EUSAGE', message: 'args must be a JSON object' } });
            return;
        }
        if (request.url === '/shutdown') {
            respond(response, 200, { ok: true, action: 'shutdown' });
            // Run after the response flushed to the socket; closing inside the
            // handler races the flush and wedges the server's close path.
            response.on('finish', () => setImmediate(state.onShutdown));
            return;
        }
        if (typeof body.action !== 'string' || body.action === '') {
            respond(response, 400, { ok: false, error: { code: 'EUSAGE', message: 'action must be a non-empty string' } });
            return;
        }
        try {
            const payload = await callCuaTool(state.driver, body.action, body.args === undefined ? undefined : JSON.stringify(body.args), 'elftia-serve');
            respond(response, 200, payload);
        }
        catch (error) {
            if (error instanceof CliError && error.code === 'EUSAGE') {
                respond(response, 400, { ok: false, error: { code: error.code, message: error.message } });
                return;
            }
            respond(response, 500, { ok: false, error: { code: 'EBACKEND', message: error instanceof Error ? error.message : String(error) } });
        }
        return;
    }
    respond(response, 404, { ok: false, error: { code: 'EUSAGE', message: 'use GET /health, POST /call or POST /shutdown' } });
}
/** Testable core: build the HTTP server around a driver + token. */
export function buildCuaServeServer(driver, token, onShutdown) {
    return createServer((request, response) => {
        handleRequest({ driver, token, onShutdown }, request, response).catch(() => {
            if (!response.headersSent)
                respond(response, 500, { ok: false, error: { code: 'EBACKEND', message: 'request failed' } });
            else
                response.end();
        });
    });
}
export async function runCuaServe(invocation, deps = createServeDeps()) {
    if (!isLoopbackHost(invocation.host)) {
        throw new CliError('EUSAGE', 'cua-serve binds loopback only; --host must be 127.0.0.1, ::1 or localhost');
    }
    const driver = await deps.loadDriver();
    const token = randomBytes(24).toString('base64url');
    // Resolved only by POST /shutdown: the caller (cli.ts) then exits cleanly.
    let release = () => undefined;
    const stopped = new Promise((resolve) => {
        release = resolve;
    });
    let shutdownStarted = false;
    const server = buildCuaServeServer(driver, token, () => {
        if (shutdownStarted)
            return;
        shutdownStarted = true;
        server.close();
        // Keep-alive pools (Node fetch, curl --keepalive) otherwise hold the
        // listening socket open; destroying them lets the process exit cleanly.
        server.closeIdleConnections();
        server.closeAllConnections();
        void driver.shutdown().catch(() => undefined).finally(() => {
            release();
            deps.processExit(0);
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', (error) => reject(new CliError('EBACKEND', `could not bind ${invocation.host}:${invocation.port} — ${error.message}`)));
        server.listen(invocation.port, invocation.host === 'localhost' ? '127.0.0.1' : invocation.host, () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
        throw new CliError('EBACKEND', 'cua-serve could not determine its bound port');
    }
    writeJsonTo(deps.stdout, { ok: true, action: 'cua-serve', url: `http://127.0.0.1:${address.port}`, host: invocation.host, port: address.port, token, pid: process.pid });
    await stopped;
}
function writeJsonTo(stream, payload) {
    stream.write(`${JSON.stringify(payload)}\n`);
}
