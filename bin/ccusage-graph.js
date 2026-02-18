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

// --- Main ---
const filePath = process.argv[2];

if (!filePath) {
  console.error(`${COLORS.red}Usage: ccusage-graph <path-to-ccusage.json>${COLORS.reset}`);
  console.error(`  Example: ccusage-graph ccusage_260119_260218.json`);
  process.exit(1);
}

let data;
try {
  const raw = readFileSync(resolve(filePath), "utf-8");
  data = JSON.parse(raw);
} catch (err) {
  console.error(`${COLORS.red}Error: Failed to read or parse ${filePath}${COLORS.reset}`);
  console.error(err.message);
  process.exit(1);
}

const { daily, totals } = data;

// ── Daily Cost Chart ──
console.log();
console.log(`${COLORS.bold}${COLORS.cyan}📊 Daily Cost${COLORS.reset}`);
printSeparator();

const maxCost = Math.max(...daily.map((d) => d.totalCost));

for (const day of daily) {
  const date = day.date.slice(5);
  const costStr = padLeft(formatCost(day.totalCost), 8);
  const barStr = bar(day.totalCost, maxCost);

  let barColor = COLORS.green;
  if (day.totalCost > maxCost * 0.75) barColor = COLORS.red;
  else if (day.totalCost > maxCost * 0.5) barColor = COLORS.yellow;

  console.log(`  ${COLORS.dim}${date}${COLORS.reset} ${costStr} ${barColor}${barStr}${COLORS.reset}`);
}

printSeparator();

// ── Daily Token Usage Chart ──
console.log();
console.log(`${COLORS.bold}${COLORS.cyan}📈 Daily Token Usage${COLORS.reset}`);
printSeparator();

const maxTokens = Math.max(...daily.map((d) => d.totalTokens));

for (const day of daily) {
  const date = day.date.slice(5);
  const tokenStr = padLeft(formatTokens(day.totalTokens), 8);
  const barStr = bar(day.totalTokens, maxTokens);

  console.log(`  ${COLORS.dim}${date}${COLORS.reset} ${tokenStr} ${COLORS.blue}${barStr}${COLORS.reset}`);
}

printSeparator();

// ── Model Breakdown ──
console.log();
console.log(`${COLORS.bold}${COLORS.cyan}🤖 Cost by Model${COLORS.reset}`);
printSeparator();

const modelTotals = {};
for (const day of daily) {
  for (const mb of day.modelBreakdowns) {
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

const dateRange = `${daily[0].date} → ${daily[daily.length - 1].date}`;
const activeDays = daily.length;
const avgDailyCost = totals.totalCost / activeDays;

console.log(`  ${COLORS.dim}Period:${COLORS.reset}        ${dateRange} (${activeDays} active days)`);
console.log(`  ${COLORS.dim}Total Cost:${COLORS.reset}    ${COLORS.bold}${formatCost(totals.totalCost)}${COLORS.reset}`);
console.log(`  ${COLORS.dim}Avg/Day:${COLORS.reset}       ${formatCost(avgDailyCost)}`);
console.log(`  ${COLORS.dim}Total Tokens:${COLORS.reset}  ${formatTokens(totals.totalTokens)}`);
console.log(
  `  ${COLORS.dim}Input:${COLORS.reset}         ${formatTokens(totals.inputTokens)}  ${COLORS.dim}Output:${COLORS.reset} ${formatTokens(totals.outputTokens)}`,
);
console.log(
  `  ${COLORS.dim}Cache Create:${COLORS.reset}  ${formatTokens(totals.cacheCreationTokens)}  ${COLORS.dim}Cache Read:${COLORS.reset} ${formatTokens(totals.cacheReadTokens)}`,
);

const peakDay = daily.reduce((max, d) => (d.totalCost > max.totalCost ? d : max));
console.log(
  `  ${COLORS.dim}Peak Day:${COLORS.reset}      ${peakDay.date} (${COLORS.red}${formatCost(peakDay.totalCost)}${COLORS.reset})`,
);

printSeparator();
console.log();
