#!/usr/bin/env node
const { execSync } = require("child_process");

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts }).trim();
}

function runInherit(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function main() {
  try {
    run("git rev-parse --is-inside-work-tree");
  } catch {
    console.error("Not a git repository. Run 'git init' first.");
    process.exit(1);
  }

  try {
    run("git rev-parse --verify HEAD");
  } catch {
    console.error("No commits found yet. Create a commit before pushing.");
    process.exit(1);
  }

  const branch = run("git branch --show-current");
  if (!branch) {
    console.error("Could not determine the current branch.");
    process.exit(1);
  }

  const hasUpstream = (() => {
    try {
      run(`git rev-parse --abbrev-ref ${branch}@{upstream}`);
      return true;
    } catch {
      return false;
    }
  })();

  if (hasUpstream) {
    runInherit("git push");
  } else {
    runInherit(`git push -u origin ${branch}`);
  }
}

main();
