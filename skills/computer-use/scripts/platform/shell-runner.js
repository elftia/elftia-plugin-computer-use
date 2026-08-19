import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { CliError, ERROR_CODES } from '../errors.js';
const execFileAsync = promisify(execFile);
export const POWERSHELL_BIN = 'powershell.exe';
/** Mandatory script-channel flags (design D2): profiles can print noise or
 * change encodings, which would break the JSON channel. */
export const PS_BASE_FLAGS = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
];
const scriptsDir = fileURLToPath(new URL('./windows/scripts/', import.meta.url));
export function scriptPath(scriptName) {
    return join(scriptsDir, scriptName);
}
function stripBom(text) {
    return text.replace(/^\uFEFF/, '');
}
function excerpt(text, max = 400) {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}
function parseScriptJson(stdout, scriptName) {
    const text = stripBom(stdout).trim();
    try {
        return JSON.parse(text);
    }
    catch {
        throw new CliError('EBACKEND', `backend script "${scriptName}" produced unparseable output: ${excerpt(text)}`);
    }
}
function cliErrorFromPayload(payload, scriptName) {
    if (typeof payload.code !== 'string' || typeof payload.message !== 'string') {
        return undefined;
    }
    const code = ERROR_CODES.includes(payload.code)
        ? payload.code
        : 'EBACKEND';
    return new CliError(code, `backend script "${scriptName}": ${payload.message}`);
}
function mapExecError(err, scriptName) {
    if (err.code === 'ENOENT') {
        return new CliError('EBACKEND', 'PowerShell (powershell.exe) was not found on PATH — the Windows backend requires Windows PowerShell 5.1+');
    }
    // A script that failed on purpose prints its JSON error before exiting non-0.
    if (typeof err.stdout === 'string' && stripBom(err.stdout).trim() !== '') {
        try {
            const parsed = JSON.parse(stripBom(err.stdout).trim());
            if (parsed.ok === false) {
                const mapped = cliErrorFromPayload(parsed.error, scriptName);
                if (mapped !== undefined) {
                    return mapped;
                }
            }
        }
        catch {
            // fall through to the generic message
        }
    }
    const stderrTail = typeof err.stderr === 'string' ? excerpt(err.stderr) : '';
    const detail = stderrTail !== ''
        ? stderrTail
        : err.killed === true
            ? 'timed out'
            : excerpt(err.message);
    return new CliError('EBACKEND', `backend script "${scriptName}" failed: ${detail}`);
}
export function createShellRunner() {
    return {
        async run(scriptName, args, opts) {
            const argv = [
                ...PS_BASE_FLAGS,
                '-File',
                scriptPath(scriptName),
                ...args.map((a) => String(a)),
            ];
            let stdout;
            try {
                const result = await execFileAsync(POWERSHELL_BIN, argv, {
                    encoding: 'utf8',
                    maxBuffer: 64 * 1024 * 1024,
                    windowsHide: true,
                    timeout: opts?.timeoutMs ?? 30_000,
                });
                stdout = result.stdout;
            }
            catch (err) {
                throw mapExecError(err, scriptName);
            }
            const json = parseScriptJson(stdout, scriptName);
            if (json.ok === false) {
                const mapped = cliErrorFromPayload(json.error, scriptName);
                throw mapped ?? new CliError('EBACKEND', `backend script "${scriptName}" failed`);
            }
            return json;
        },
        async probe() {
            const started = Date.now();
            const script = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
                '$o = [ordered]@{ version = $PSVersionTable.PSVersion.ToString(); ' +
                'elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]' +
                '::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }; ' +
                '[Console]::Out.WriteLine((ConvertTo-Json -InputObject $o -Compress))';
            let stdout;
            try {
                const result = await execFileAsync(POWERSHELL_BIN, [...PS_BASE_FLAGS, '-Command', script], { encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true, timeout: 15_000 });
                stdout = result.stdout;
            }
            catch (err) {
                throw mapExecError(err, 'probe');
            }
            const latencyMs = Date.now() - started;
            let parsed;
            try {
                parsed = JSON.parse(stripBom(stdout).trim());
            }
            catch {
                throw new CliError('EBACKEND', `PowerShell probe produced unparseable output: ${excerpt(stdout)}`);
            }
            if (typeof parsed.version !== 'string') {
                throw new CliError('EBACKEND', 'PowerShell probe output is missing the version field');
            }
            return {
                version: parsed.version,
                elevated: parsed.elevated === true,
                latencyMs,
            };
        },
    };
}
