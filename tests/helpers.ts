import { execSync } from "child_process";
import path from "path";

// Wrapper: testcontainers exec() hangs in bun, use docker exec directly
export function exec(
  containerId: string,
  cmd: string
): { exitCode: number; output: string } {
  try {
    const output = execSync(
      `docker exec ${containerId} sh -c '${cmd.replace(/'/g, `'\\''`)}'`,
      { encoding: "utf-8", timeout: 15_000 }
    );
    return { exitCode: 0, output: output.trim() };
  } catch (e: any) {
    return {
      exitCode: e.status ?? 1,
      output: (e.stdout?.toString() ?? "").trim(),
    };
  }
}

// Copy a local file into the container
export function copyToContainer(containerId: string, localPath: string, containerPath: string) {
  execSync(`docker cp "${localPath}" ${containerId}:${containerPath}`, { timeout: 10_000 });
}

export const HOME = "/root";
export const INSTALL = `${HOME}/.oh-my-skills`;
export const SCRIPTS_DIR = path.resolve(import.meta.dir, "../scripts");
