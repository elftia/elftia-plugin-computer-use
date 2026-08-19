/**
 * JSON stdout discipline: every command prints exactly one JSON object.
 * Diagnostics (if any) go to stderr — never stdout.
 */
export function writeJson(payload) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
}
export function writeErrorJson(code, message) {
    writeJson({ ok: false, error: { code, message } });
}
