#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Config ---
const BAR_MAX_WIDTH = 40;
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// --- Helpers ---
function bar(value, maxValue, width = BAR_MAX_WIDTH) {
  const filled = Math.round((value / maxValue) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function formatCost(cost) {
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

function padRight(str, len) {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function padLeft(str, len) {
  return str.length >= len ? str : " ".repeat(len - str.length) + str;
}

function printSeparator(char = "─", len = 80) {
  console.log(COLORS.dim + char.repeat(len) + COLORS.reset);
}

// --- Stdin Helper ---
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

// --- Main ---
const filePath = process.argv[2];

if (!filePath && process.stdin.isTTY) {
  console.error(`${COLORS.red}Usage: ccusage-graph <path-to-ccusage.json>${COLORS.reset}`);
  console.error(`       ccusage daily --json | ccusage-graph`);
  console.error(`  Example: ccusage-graph ccusage_260119_260218.json`);
  process.exit(1);
}

let data;
try {
  const raw = filePath
    ? readFileSync(resolve(filePath), "utf-8")
    : await readStdin();
  data = JSON.parse(raw);
} catch (err) {
  const source = filePath || "stdin";
  console.error(`${COLORS.red}Error: Failed to read or parse ${source}${COLORS.reset}`);
  console.error(err.message);
  process.exit(1);
}

// ── Detect data format ──
let entries;
let mode; // "daily" | "weekly" | "monthly"
let labelKey; // "date" | "week" | "month"; latest ccusage uses "period" for all modes

if (data.daily) {
  entries = data.daily;
  mode = "daily";
  labelKey = "date";
} else if (data.weekly) {
  entries = data.weekly;
  mode = "weekly";
  labelKey = "week";
} else if (data.monthly) {
  entries = data.monthly;
  mode = "monthly";
  labelKey = "month";
} else {
  console.error(`${COLORS.red}Error: Unsupported JSON format. Expected "daily", "weekly", or "monthly" key.${COLORS.reset}`);
  process.exit(1);
}

const { totals } = data;

const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1); // "Daily" | "Weekly" | "Monthly"
const unitLabel = mode === "daily" ? "days" : mode === "weekly" ? "weeks" : "months";
const peakLabel = mode === "daily" ? "Peak Day" : mode === "weekly" ? "Peak Week" : "Peak Month";
const avgLabel = mode === "daily" ? "Avg/Day" : mode === "weekly" ? "Avg/Week" : "Avg/Month";

function getPeriod(entry) {
  return entry[labelKey] ?? entry.period;
}

function getLabel(entry) {
  const raw = getPeriod(entry);
  if (mode === "monthly") return raw; // "2026-01"
  return raw.slice(5); // "01-18" from "2026-01-18"
}

// ── Cost Chart ──
console.log();
console.log(`${COLORS.bold}${COLORS.cyan}📊 ${modeLabel} Cost${COLORS.reset}`);
printSeparator();

const maxCost = Math.max(...entries.map((d) => d.totalCost));

for (const entry of entries) {
  const label = getLabel(entry);
  const costStr = padLeft(formatCost(entry.totalCost), 8);
  const barStr = bar(entry.totalCost, maxCost);

  let barColor = COLORS.green;
  if (entry.totalCost > maxCost * 0.75) barColor = COLORS.red;
  else if (entry.totalCost > maxCost * 0.5) barColor = COLORS.yellow;

  console.log(`  ${COLORS.dim}${label}${COLORS.reset} ${costStr} ${barColor}${barStr}${COLORS.reset}`);
}

printSeparator();

// ── Token Usage Chart ──
console.log();
console.log(`${COLORS.bold}${COLORS.cyan}📈 ${modeLabel} Token Usage${COLORS.reset}`);
printSeparator();

const maxTokens = Math.max(...entries.map((d) => d.totalTokens));

for (const entry of entries) {
  const label = getLabel(entry);
  const tokenStr = padLeft(formatTokens(entry.totalTokens), 8);
  const barStr = bar(entry.totalTokens, maxTokens);

  console.log(`  ${COLORS.dim}${label}${COLORS.reset} ${tokenStr} ${COLORS.blue}${barStr}${COLORS.reset}`);
}

printSeparator();

// ── Model Breakdown ──
console.log();
console.log(`${COLORS.bold}${COLORS.cyan}🤖 Cost by Model${COLORS.reset}`);
printSeparator();

const modelTotals = {};
for (const entry of entries) {
  for (const mb of entry.modelBreakdowns) {
    if (!modelTotals[mb.modelName]) {
      modelTotals[mb.modelName] = { cost: 0, tokens: 0 };
    }
    modelTotals[mb.modelName].cost += mb.cost;
    modelTotals[mb.modelName].tokens +=
      mb.inputTokens + mb.outputTokens + mb.cacheCreationTokens + mb.cacheReadTokens;
  }
}

const modelEntries = Object.entries(modelTotals).sort((a, b) => b[1].cost - a[1].cost);
const maxModelCost = Math.max(...modelEntries.map(([, v]) => v.cost));
const modelColors = [COLORS.magenta, COLORS.cyan, COLORS.yellow, COLORS.green, COLORS.blue];

for (let i = 0; i < modelEntries.length; i++) {
  const [name, { cost }] = modelEntries[i];
  const shortName = name.replace("claude-", "").replace(/-\d{8}$/, "");
  const pct = ((cost / totals.totalCost) * 100).toFixed(1);
  const color = modelColors[i % modelColors.length];
  const barStr = bar(cost, maxModelCost, 30);

  console.log(
    `  ${color}${padRight(shortName, 20)}${COLORS.reset} ${padLeft(formatCost(cost), 9)} ${COLORS.dim}(${padLeft(pct, 5)}%)${COLORS.reset} ${color}${barStr}${COLORS.reset}`,
  );
}

printSeparator();

// ── Summary ──
console.log();
console.log(`${COLORS.bold}${COLORS.cyan}📋 Summary${COLORS.reset}`);
printSeparator();

const dateRange = `${getPeriod(entries[0])} → ${getPeriod(entries[entries.length - 1])}`;
const activeCount = entries.length;
const avgCost = totals.totalCost / activeCount;

console.log(`  ${COLORS.dim}Period:${COLORS.reset}        ${dateRange} (${activeCount} active ${unitLabel})`);
console.log(`  ${COLORS.dim}Total Cost:${COLORS.reset}    ${COLORS.bold}${formatCost(totals.totalCost)}${COLORS.reset}`);
console.log(`  ${COLORS.dim}${avgLabel}:${COLORS.reset}${" ".repeat(Math.max(1, 13 - avgLabel.length))}${formatCost(avgCost)}`);
console.log(`  ${COLORS.dim}Total Tokens:${COLORS.reset}  ${formatTokens(totals.totalTokens)}`);
console.log(
  `  ${COLORS.dim}Input:${COLORS.reset}         ${formatTokens(totals.inputTokens)}  ${COLORS.dim}Output:${COLORS.reset} ${formatTokens(totals.outputTokens)}`,
);
console.log(
  `  ${COLORS.dim}Cache Create:${COLORS.reset}  ${formatTokens(totals.cacheCreationTokens)}  ${COLORS.dim}Cache Read:${COLORS.reset} ${formatTokens(totals.cacheReadTokens)}`,
);

const peakEntry = entries.reduce((max, d) => (d.totalCost > max.totalCost ? d : max));
console.log(
  `  ${COLORS.dim}${peakLabel}:${COLORS.reset}${" ".repeat(Math.max(1, 13 - peakLabel.length))}${getPeriod(peakEntry)} (${COLORS.red}${formatCost(peakEntry.totalCost)}${COLORS.reset})`,
);

printSeparator();
console.log();
