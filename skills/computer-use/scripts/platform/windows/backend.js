import { CliError } from '../../errors.js';
import { createShellRunner } from '../shell-runner.js';
function asRecord(value, where) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value;
    }
    throw new CliError('EBACKEND', `backend field ${where} is not an object`);
}
function toNum(value, where) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return Number(value);
    }
    throw new CliError('EBACKEND', `backend field ${where} is not a number`);
}
function toStr(value) {
    return typeof value === 'string' ? value : '';
}
function parseRect(value, where) {
    const rec = asRecord(value, where);
    return {
        x: toNum(rec.x, `${where}.x`),
        y: toNum(rec.y, `${where}.y`),
        width: toNum(rec.width, `${where}.width`),
        height: toNum(rec.height, `${where}.height`),
    };
}
function parseAppWindow(value) {
    const rec = asRecord(value, 'app window');
    return {
        id: toNum(rec.id, 'window.id'),
        pid: toNum(rec.pid, 'window.pid'),
        title: toStr(rec.title),
        appName: toStr(rec.appName),
        bounds: parseRect(rec.bounds, 'window.bounds'),
    };
}
function parseElement(value, i) {
    const rec = asRecord(value, `elements[${i}]`);
    const center = asRecord(rec.center, `elements[${i}].center`);
    return {
        index: toNum(rec.index, `elements[${i}].index`),
        role: toStr(rec.role),
        name: toStr(rec.name),
        controlType: toStr(rec.controlType),
        bounds: parseRect(rec.bounds, `elements[${i}].bounds`),
        center: {
            x: toNum(center.x, `elements[${i}].center.x`),
            y: toNum(center.y, `elements[${i}].center.y`),
        },
    };
}
/**
 * Windows implementation of the PlatformBackend seam: every op is one
 * PowerShell script invocation through the injectable ShellRunner (design D2).
 */
export class WindowsBackend {
    os = 'windows';
    runner;
    constructor(runner = createShellRunner()) {
        this.runner = runner;
    }
    async listApps() {
        const json = await this.runner.run('apps.ps1', []);
        if (!Array.isArray(json.apps)) {
            throw new CliError('EBACKEND', 'apps.ps1 did not return a windows array');
        }
        return json.apps.map((w) => parseAppWindow(w));
    }
    async getState() {
        const json = await this.runner.run('cursor-state.ps1', []);
        const cursor = asRecord(json.cursor, 'cursor');
        const screen = asRecord(json.screen, 'screen');
        return {
            cursor: { x: toNum(cursor.x, 'cursor.x'), y: toNum(cursor.y, 'cursor.y') },
            screen: { width: toNum(screen.width, 'screen.width'), height: toNum(screen.height, 'screen.height') },
            activeWindow: parseAppWindow(json.activeWindow),
        };
    }
    async capture(windowId, opts) {
        const args = ['-OutPath', opts.outPath];
        if (windowId !== undefined) {
            args.push('-WindowId', windowId);
        }
        if (opts.region !== undefined) {
            args.push('-X1', opts.region.x1, '-Y1', opts.region.y1, '-X2', opts.region.x2, '-Y2', opts.region.y2);
        }
        if (opts.maxEdge !== undefined) {
            args.push('-MaxEdge', opts.maxEdge);
        }
        const json = await this.runner.run('screenshot.ps1', args, { timeoutMs: 60_000 });
        const image = {
            path: toStr(json.path),
            width: toNum(json.width, 'screenshot.width'),
            height: toNum(json.height, 'screenshot.height'),
        };
        if (windowId !== undefined) {
            image.window = windowId;
        }
        return image;
    }
    captureScreen(opts) {
        return this.capture(undefined, opts);
    }
    async cropImage(opts) {
        const args = [
            '-InPath', opts.sourcePath,
            '-X1', opts.region.x1, '-Y1', opts.region.y1, '-X2', opts.region.x2, '-Y2', opts.region.y2,
            '-OutPath', opts.outPath,
        ];
        const json = await this.runner.run('crop.ps1', args, { timeoutMs: 30_000 });
        const sourceEcho = (json.source ?? {});
        return {
            path: toStr(json.path),
            width: toNum(json.width, 'crop.width'),
            height: toNum(json.height, 'crop.height'),
            source: {
                path: toStr(sourceEcho.path ?? opts.sourcePath),
                width: toNum(sourceEcho.width, 'crop.source.width'),
                height: toNum(sourceEcho.height, 'crop.source.height'),
            },
            region: opts.region,
        };
    }
    captureWindow(windowId, opts) {
        return this.capture(windowId, opts);
    }
    async sendInput(evt) {
        const args = ['-Op', evt.kind];
        switch (evt.kind) {
            case 'click':
                args.push('-X', evt.x, '-Y', evt.y, '-Button', evt.button, '-Count', evt.count);
                if (evt.mods.length > 0) {
                    args.push('-Mods', evt.mods.join(','));
                }
                break;
            case 'key':
                args.push('-Vk', evt.vk, '-Extended', evt.extended ? 1 : 0);
                if (evt.mods.length > 0) {
                    args.push('-Mods', evt.mods.join(','));
                }
                break;
            case 'scroll':
                args.push('-X', evt.x, '-Y', evt.y, '-Direction', evt.direction, '-Amount', evt.amount);
                break;
            case 'drag':
                args.push('-FromX', evt.fromX, '-FromY', evt.fromY, '-ToX', evt.toX, '-ToY', evt.toY);
                break;
            case 'move':
                args.push('-X', evt.x, '-Y', evt.y);
                break;
        }
        await this.runner.run('input.ps1', args);
    }
    async uiaTree(opts) {
        const args = ['-Mode', opts.mode];
        if (opts.windowId !== undefined) {
            args.push('-WindowId', opts.windowId);
        }
        if (opts.pid !== undefined) {
            args.push('-TargetPid', opts.pid);
        }
        if (opts.mode === 'tree') {
            args.push('-MaxDepth', opts.maxDepth ?? 4, '-MaxNodes', opts.maxNodes ?? 4000, '-OutPath', opts.outPath ?? '');
            const json = await this.runner.run('uia-tree.ps1', args, { timeoutMs: 120_000 });
            return {
                kind: 'tree',
                file: toStr(json.file),
                count: toNum(json.count, 'tree.count'),
                truncated: json.truncated === true,
            };
        }
        args.push('-MaxDepth', opts.maxDepth ?? 10, '-MaxElements', opts.maxElements ?? 200, '-MaxVisited', opts.maxVisited ?? 20_000);
        const json = await this.runner.run('uia-tree.ps1', args, { timeoutMs: 120_000 });
        const rawElements = Array.isArray(json.elements) ? json.elements : [];
        return {
            kind: 'elements',
            elements: rawElements.map((el, i) => parseElement(el, i)),
            truncated: json.truncated === true,
        };
    }
    async clipboardType(text) {
        await this.runner.run('clipboard-type.ps1', ['-Text', text], { timeoutMs: 30_000 });
    }
    async probe(probeOpts) {
        const base = await this.runner.probe();
        let echo;
        if (probeOpts?.echo !== undefined) {
            const json = await this.runner.run('echo.ps1', ['-Text', probeOpts.echo]);
            echo = typeof json.echo === 'string' ? json.echo : undefined;
        }
        return { version: base.version, latencyMs: base.latencyMs, elevated: base.elevated, echo };
    }
}
