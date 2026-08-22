import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { GenericContainer, type StartedTestContainer } from "testcontainers";

export const HOME = "/root";
export const INSTALL = `${HOME}/.oh-my-skills`;
export const SCRIPTS_DIR = path.resolve(import.meta.dir, "../scripts");
export const PROJECT_DIR = path.resolve(import.meta.dir, "..");

// Read version from package.json (single source of truth)
const pkg = await Bun.file(path.join(PROJECT_DIR, "package.json")).json();
export const VERSION: string = pkg.version;

// Shared base image with every package the suite needs pre-installed.
export const TEST_IMAGE = "oh-my-skills-test:latest";

// Built at most once per process, and skipped entirely when the image already
// exists. `bun test --parallel` runs one worker per process, so a cold suite
// may race a few builds — Docker serialises identical builds and the layer
// cache makes the losers near-instant.
let imageReady: Promise<void> | undefined;

export function ensureTestImage(): Promise<void> {
	imageReady ??= (async () => {
		try {
			execFileSync("docker", ["image", "inspect", TEST_IMAGE], {
				stdio: "ignore",
			});
			return;
		} catch {
			// Image missing — build it.
		}
		execFileSync(
			"docker",
			["build", "-t", TEST_IMAGE, path.join(PROJECT_DIR, "tests")],
			{ stdio: "ignore", timeout: 300_000 },
		);
	})();
	return imageReady;
}

// Start a container off the shared base image. Replaces the per-file
// `new GenericContainer("alpine:latest")` + `apk add` pair.
export async function startContainer(): Promise<StartedTestContainer> {
	await ensureTestImage();
	return new GenericContainer(TEST_IMAGE)
		.withCommand(["sleep", "infinity"])
		.start();
}

// Run a shell command in the container.
//
// Uses testcontainers' native exec (~13ms/call) rather than spawning the
// `docker` CLI (~34ms/call). It hung under Bun before 1.4; the 1.4 release
// notes list `container.exec()` for testcontainers/dockerode as fixed.
//
// `output` is stdout only, matching the previous execSync-based behaviour:
// tests that need stderr redirect it with `2>&1` themselves.
export async function exec(
	container: StartedTestContainer,
	cmd: string,
): Promise<{ exitCode: number; output: string }> {
	const result = await container.exec(["sh", "-c", cmd]);
	return { exitCode: result.exitCode, output: result.stdout.trim() };
}

// Copy a local file or directory into the container, preserving modes.
// testcontainers splits these into two APIs where `docker cp` took either.
export async function copyToContainer(
	container: StartedTestContainer,
	localPath: string,
	containerPath: string,
): Promise<void> {
	const entry = [{ source: localPath, target: containerPath }];
	if (statSync(localPath).isDirectory()) {
		await container.copyDirectoriesToContainer(entry);
	} else {
		await container.copyFilesToContainer(entry);
	}
}
