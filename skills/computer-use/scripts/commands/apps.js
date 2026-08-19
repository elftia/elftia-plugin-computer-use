export async function runApps(deps) {
    const apps = await deps.backend.listApps();
    return { ok: true, apps };
}
