export const ERROR_CODES = [
    'EUSAGE',
    'ENOTSUPPORTED',
    'EBACKEND',
    'EINPUT',
    'ESTALE',
    'EIO',
];
export class CliError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'CliError';
        this.code = code;
    }
}
export function usageError(message) {
    return new CliError('EUSAGE', message);
}
export function toCliError(err, fallbackCode = 'EBACKEND') {
    if (err instanceof CliError) {
        return err;
    }
    const message = err instanceof Error ? err.message : String(err);
    return new CliError(fallbackCode, message);
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
