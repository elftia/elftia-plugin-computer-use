import { selectPlatform } from '../platform/index.js';
export function createDefaultDeps() {
    return {
        backend: selectPlatform(),
        cwd: process.cwd(),
        now: () => new Date(),
    };
}
