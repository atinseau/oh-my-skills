import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { exec, copyToContainer, HOME, INSTALL, SCRIPTS_DIR } from "./helpers";

describe("oh-my-skills Uninstall (real script)", () => {
  let container: StartedTestContainer;
  let id: string;

  beforeAll(async () => {
    container = await new GenericContainer("alpine:latest")
      .withCommand(["sleep", "infinity"])
      .start();
    id = container.getId();

    // Install deps
    exec(id, "apk add --no-cache git bash jq >/dev/null 2>&1");

    // Copy real scripts
    exec(id, "mkdir -p /scripts");
    copyToContainer(id, `${SCRIPTS_DIR}/install.sh`, "/scripts/install.sh");
    copyToContainer(id, `${SCRIPTS_DIR}/uninstall.sh`, "/scripts/uninstall.sh");
    exec(id, "chmod +x /scripts/*.sh");

    // Create local repo
    exec(id, "mkdir -p /tmp/remote-repo");
    exec(id, "cd /tmp/remote-repo && git init && git config user.email 't@t' && git config user.name 'T'");
    exec(id, "mkdir -p /tmp/remote-repo/src/skills/test-skill");
    exec(id, `printf '%s\\n' '---' 'name: test-skill' 'by: oh-my-skills' '---' 'Test.' > /tmp/remote-repo/src/skills/test-skill/SKILL.md`);
    exec(id, "mkdir -p /tmp/remote-repo/src/commands");
    exec(id, `printf '#!/bin/bash\\nalias hi="echo hi"\\n' > /tmp/remote-repo/src/commands/hi.sh`);
    exec(id, "mkdir -p /tmp/remote-repo/scripts && cp /scripts/*.sh /tmp/remote-repo/scripts/");
    exec(id, "cd /tmp/remote-repo && git add . && git commit -m 'init'");

    // Fake LLM binaries
    exec(id, `printf '#!/bin/sh\\necho claude' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude`);
    exec(id, `printf '#!/bin/sh\\necho copilot' > /usr/local/bin/copilot && chmod +x /usr/local/bin/copilot`);

    // Create .bashrc
    exec(id, `printf '%s\\n' '# original config' 'export LANG=en' > ${HOME}/.bashrc`);

    // Run install first
    exec(id, `REPO_URL=/tmp/remote-repo bash /scripts/install.sh`);

    // Also create a foreign skill (not from oh-my-skills)
    exec(id, `mkdir -p ${HOME}/.claude/skills/foreign-skill`);
    exec(id, `printf '%s\\n' '---' 'name: foreign' 'by: someone-else' '---' > ${HOME}/.claude/skills/foreign-skill/SKILL.md`);
  }, 60_000);

  afterAll(async () => {
    if (container) await container.stop();
  });

  // Verify installation exists before uninstall
  it("should have a working installation before uninstall", () => {
    const reg = exec(id, `test -f ${INSTALL}/registry.json && echo ok`);
    expect(reg.output).toBe("ok");

    const skill = exec(id, `test -f ${HOME}/.claude/skills/test-skill/SKILL.md && echo ok`);
    expect(skill.output).toBe("ok");

    const sourcing = exec(id, `grep -q "oh-my-skills" ${HOME}/.bashrc && echo ok`);
    expect(sourcing.output).toBe("ok");
  });

  it("should run uninstall.sh successfully", () => {
    // Pipe "y" for confirmation
    const r = exec(id, `echo y | bash /scripts/uninstall.sh`);
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("Uninstallation Complete");
  });

  it("should have removed skills with oh-my-skills marker from Claude", () => {
    const r = exec(id, `test -d ${HOME}/.claude/skills/test-skill && echo exists || echo gone`);
    expect(r.output).toBe("gone");
  });

  it("should have removed skills with oh-my-skills marker from Copilot", () => {
    const r = exec(id, `test -d ${HOME}/.copilot/skills/test-skill && echo exists || echo gone`);
    expect(r.output).toBe("gone");
  });

  it("should have preserved foreign skills (no marker)", () => {
    const r = exec(id, `test -f ${HOME}/.claude/skills/foreign-skill/SKILL.md && echo exists`);
    expect(r.output).toBe("exists");
  });

  it("should have removed sourcing from .bashrc", () => {
    const r = exec(id, `grep -q "oh-my-skills" ${HOME}/.bashrc && echo found || echo gone`);
    expect(r.output).toBe("gone");
  });

  it("should have preserved original .bashrc content", () => {
    const r = exec(id, `cat ${HOME}/.bashrc`);
    expect(r.output).toContain("original config");
  });

  it("should have removed ~/.oh-my-skills directory", () => {
    const r = exec(id, `test -d ${INSTALL} && echo exists || echo gone`);
    expect(r.output).toBe("gone");
  });

  it("should handle running uninstall again gracefully (already removed)", () => {
    const r = exec(id, `bash /scripts/uninstall.sh`);
    expect(r.exitCode).toBe(0);
    expect(r.output).toContain("not installed");
  });
});
