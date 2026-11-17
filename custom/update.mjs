import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import * as NodePath from "node:path";

const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const manifestPath = new URL("./release.json", import.meta.url);
const release = JSON.parse(NodeFS.readFileSync(manifestPath, "utf8"));

function run(command, args, options = {}) {
  const result = NodeChildProcess.spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stderr ?? ""}`);
  return result.stdout?.trim() ?? "";
}

async function latestTag() {
  const response = await fetch(
    `https://api.github.com/repos/${release.upstreamRepository}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    },
  );
  if (!response.ok) throw new Error(`Cannot read upstream release (${response.status}).`);
  return (await response.json()).tag_name;
}

async function sync(tag) {
  if (tag === "latest") tag = await latestTag();
  if (!/^v\d+\.\d+\.\d+$/.test(tag))
    throw new Error("Expected an upstream stable tag such as v0.1.10.");
  if (tag === release.upstreamTag) {
    process.stdout.write(`Already based on ${tag}.\n`);
    return;
  }
  if (tag.localeCompare(release.upstreamTag, "en", { numeric: true }) <= 0)
    throw new Error(`Select a release newer than ${release.upstreamTag}.`);
  if (run("git", ["status", "--porcelain"]))
    throw new Error("Commit local changes before synchronizing upstream.");
  const sourceRef = `refs/remotes/upstream/releases/${tag}`;
  const fetchArgs = ["fetch", "--no-tags"];
  if (run("git", ["rev-parse", "--is-shallow-repository"]) === "true")
    fetchArgs.push("--unshallow");
  run(
    "git",
    [
      ...fetchArgs,
      `https://github.com/${release.upstreamRepository}.git`,
      `refs/tags/${tag}:${sourceRef}`,
    ],
    { stdio: "inherit" },
  );
  const previousHead = run("git", ["rev-parse", "HEAD"]);
  const merge = NodeChildProcess.spawnSync("git", ["merge", "--no-ff", "--no-commit", sourceRef], {
    cwd: root,
    stdio: "inherit",
  });
  if (merge.status !== 0) {
    const conflicts = run("git", ["diff", "--name-only", "--diff-filter=U"])
      .split("\n")
      .filter(Boolean);
    if (!conflicts.length || conflicts.some((file) => !file.startsWith(".github/workflows/"))) {
      run("git", ["merge", "--abort"]);
      throw new Error(`Upstream merge needs adaptation in these files\n${conflicts.join("\n")}`);
    }
  }
  run("git", [
    "restore",
    `--source=${previousHead}`,
    "--staged",
    "--worktree",
    "--",
    ".github/workflows",
  ]);
  release.upstreamTag = tag;
  release.version = tag.slice(1);
  NodeFS.writeFileSync(manifestPath, JSON.stringify(release, null, 2) + "\n");
  run("git", ["add", "custom/release.json"]);
  run("git", ["commit", "-m", `chore(custom): track upstream ${tag}`], { stdio: "inherit" });
}

function build(extraArgs) {
  const repository = process.env.CUSTOM_UPDATE_REPOSITORY || release.updateRepository;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || repository === release.upstreamRepository)
    throw new Error("Set your own updateRepository in custom/release.json.");
  const environment = {
    ...process.env,
    APP_VERSION: release.version,
    T3CODE_DESKTOP_UPDATE_REPOSITORY: repository,
    T3CODE_PREPARE_SERVER_COMPILE_CACHE: "0",
  };
  for (const key of Object.keys(environment))
    if (key.toLowerCase() === "path") delete environment[key];
  environment.PATH =
    NodePath.join(root, "node_modules", ".bin") + NodePath.delimiter + (process.env.PATH ?? "");
  const args = [
    "scripts/build-desktop-artifact.ts",
    "--platform",
    "win",
    "--target",
    "nsis",
    "--arch",
    "x64",
    "--build-version",
    release.version,
    ...extraArgs,
  ];
  const result = NodeChildProcess.spawnSync(process.execPath, args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Custom installer build failed (${result.status}).`);
}

const [operation = "status", ...args] = process.argv.slice(2);
try {
  if (operation === "sync") await sync(args[0] ?? "latest");
  else if (operation === "build") build(args);
  else if (operation === "status")
    process.stdout.write(
      JSON.stringify({ ...release, commit: run("git", ["rev-parse", "HEAD"]) }, null, 2) + "\n",
    );
  else throw new Error("Use status, sync [latest|vX.Y.Z], or build [desktop build flags].");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
