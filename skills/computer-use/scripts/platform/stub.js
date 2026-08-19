import { CliError } from '../errors.js';
/**
 * Honest failure on platforms without an implementation (frozen contract):
 * every platform-backed op exits non-0 with ENOTSUPPORTED naming the OS.
 * Help/version are handled before platform dispatch and always work.
 */
export class StubBackend {
    os;
    constructor(os) {
        this.os = os;
    }
    fail(op) {
        throw new CliError('ENOTSUPPORTED', `${op} is not yet supported on ${this.os}`);
    }
    async listApps() {
        this.fail('apps');
    }
    async getState() {
        this.fail('get-state');
    }
    cropImage() {
        this.fail('crop');
    }
    async captureScreen(_opts) {
        this.fail('screenshot');
    }
    async captureWindow(_windowId, _opts) {
        this.fail('screenshot --window');
    }
    async sendInput(_evt) {
        this.fail('input injection');
    }
    async uiaTree(_opts) {
        this.fail('uia-tree');
    }
    async clipboardType(_text) {
        this.fail('type');
    }
    async probe(_opts) {
        this.fail('doctor probe');
    }
}
