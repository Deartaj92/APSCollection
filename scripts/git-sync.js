#!/usr/bin/env node
const { execSync } = require("child_process");

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts }).trim();
}

function runInherit(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function escapeCommitMessage(message) {
  return message.replace(/"/g, '\\"');
}

function main() {
  const messageArg = process.argv.slice(2).join(" ").trim();
  const defaultMessage = `chore: update ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  const commitMessage = messageArg || defaultMessage;

  try {
    run("git rev-parse --is-inside-work-tree");
  } catch {
    console.error("Not a git repository. Run 'git init' first.");
    process.exit(1);
  }

  runInherit("git add -A");
  const staged = run("git diff --cached --name-only");
  if (!staged) {
    console.log("No staged changes. Nothing to commit.");
    return;
  }

  runInherit(`git commit -m "${escapeCommitMessage(commitMessage)}"`);

  const branch = run("git branch --show-current");
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
