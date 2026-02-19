import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../bin/ccusage-graph.js");
const FIXTURES = {
  daily: resolve(__dirname, "../ccusage_daily.json"),
  weekly: resolve(__dirname, "../ccusage_weekly.json"),
  monthly: resolve(__dirname, "../ccusage_monthly.json"),
};

function run(args = [], options = {}) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf-8",
    timeout: 5000,
    ...options,
  });
}

function runWithPipe(jsonPath) {
  return execSync(`cat "${jsonPath}" | node "${CLI}"`, {
    encoding: "utf-8",
    timeout: 5000,
  });
}

// --- File mode (existing) ---

describe("file mode", () => {
  it("renders daily JSON", () => {
    const output = run([FIXTURES.daily]);

    assert.match(output, /Daily Cost/);
    assert.match(output, /Daily Token Usage/);
    assert.match(output, /Cost by Model/);
    assert.match(output, /Summary/);
  });

  it("renders weekly JSON", () => {
    const output = run([FIXTURES.weekly]);

    assert.match(output, /Weekly Cost/);
    assert.match(output, /Weekly Token Usage/);
    assert.match(output, /Summary/);
  });

  it("renders monthly JSON", () => {
    const output = run([FIXTURES.monthly]);

    assert.match(output, /Monthly Cost/);
    assert.match(output, /Monthly Token Usage/);
    assert.match(output, /Summary/);
  });
});

// --- Pipe mode (new) ---

describe("pipe mode", () => {
  it("renders daily JSON from stdin", () => {
    const output = runWithPipe(FIXTURES.daily);

    assert.match(output, /Daily Cost/);
    assert.match(output, /Daily Token Usage/);
    assert.match(output, /Cost by Model/);
    assert.match(output, /Summary/);
  });

  it("renders weekly JSON from stdin", () => {
    const output = runWithPipe(FIXTURES.weekly);

    assert.match(output, /Weekly Cost/);
    assert.match(output, /Summary/);
  });

  it("renders monthly JSON from stdin", () => {
    const output = runWithPipe(FIXTURES.monthly);

    assert.match(output, /Monthly Cost/);
    assert.match(output, /Summary/);
  });

  it("produces same output as file mode", () => {
    const fileOutput = run([FIXTURES.daily]);
    const pipeOutput = runWithPipe(FIXTURES.daily);

    assert.equal(fileOutput, pipeOutput);
  });
});

// --- Error cases ---

describe("error handling", () => {
  it("exits with code 1 for nonexistent file", () => {
    assert.throws(
      () => run(["nonexistent.json"]),
      (err) => {
        assert.equal(err.status, 1);
        assert.match(err.stderr, /Failed to read or parse/);
        return true;
      },
    );
  });

  it("exits with code 1 for invalid JSON via pipe", () => {
    assert.throws(
      () =>
        execSync(`echo 'not json' | node "${CLI}"`, {
          encoding: "utf-8",
          timeout: 5000,
        }),
      (err) => {
        assert.match(err.stderr, /Failed to read or parse stdin/);
        return true;
      },
    );
  });

  it("exits with code 1 for unsupported JSON format via pipe", () => {
    assert.throws(
      () =>
        execSync(`echo '{"unknown":[]}' | node "${CLI}"`, {
          encoding: "utf-8",
          timeout: 5000,
        }),
      (err) => {
        assert.match(err.stderr, /Unsupported JSON format/);
        return true;
      },
    );
  });
});
