export function getDefaultCwd(): string {
    return process.env.INIT_CWD || process.cwd();
}