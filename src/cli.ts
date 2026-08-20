#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDigest } from "./digestBuilder.js";
import { fetchAccount, fetchAllRepos, GithubApiError, searchRecentIssuesAndPrs } from "./githubClient.js";
import { lookupNpmPackages } from "./npmClient.js";
import { renderMarkdown } from "./reportRenderer.js";
import type { RawAccountData } from "./types.js";
import { formatNumber } from "./utils.js";

interface CliArgs {
  account: string;
  windowDays: number;
  outDir: string;
  repoLimit: number;
}

function parseArgs(argv: string[]): CliArgs {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const account = positional[0];
  if (!account) {
    printUsage();
    process.exit(1);
  }

  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, "true");
      }
    }
  }

  const windowDays = Number(flags.get("days") ?? "7");
  const outDir = flags.get("out") ?? "output";
  const repoLimit = Number(flags.get("limit") ?? "100");

  return { account, windowDays: Number.isFinite(windowDays) ? windowDays : 7, outDir, repoLimit: Number.isFinite(repoLimit) ? repoLimit : 100 };
}

function printUsage(): void {
  console.error(`Usage: npm run digest -- <org-or-username> [--days 7|30] [--out <dir>] [--limit <maxRepos>]

Examples:
  npm run digest -- expressjs
  npm run digest -- expressjs --days 30 --out sample-output
  npm run digest -- sindresorhus --limit 40
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  console.log(`Fetching account info for "${args.account}"...`);
  let account;
  try {
    account = await fetchAccount(args.account);
  } catch (err) {
    handleFatal(err);
    return;
  }
  console.log(`  -> ${account.type} account, ${formatNumber(account.publicRepos)} public repos.`);

  console.log(`Fetching repos (this paginates at 100/page)...`);
  let repos;
  try {
    repos = await fetchAllRepos(account.login, account.type);
  } catch (err) {
    handleFatal(err);
    return;
  }
  console.log(`  -> fetched ${formatNumber(repos.length)} repos.`);

  const since = new Date();
  since.setDate(since.getDate() - Math.max(args.windowDays, 30)); // fetch a slightly wider net; builder trims to the exact window
  console.log(`Searching issues/PRs created since ${since.toISOString().slice(0, 10)}...`);
  let issuesAndPrs;
  try {
    issuesAndPrs = await searchRecentIssuesAndPrs(account.login, account.type, since.toISOString());
  } catch (err) {
    handleFatal(err);
    return;
  }
  console.log(`  -> ${formatNumber(issuesAndPrs.issues.length)} issues, ${formatNumber(issuesAndPrs.prs.length)} PRs found.`);

  const reposToCheck = [...repos].sort((a, b) => b.stars - a.stars).slice(0, args.repoLimit);
  console.log(`Cross-referencing ${formatNumber(reposToCheck.length)} repos against the npm registry...`);
  const npmPackages = await lookupNpmPackages(reposToCheck.map((r) => r.name));
  const publishedCount = Object.values(npmPackages).filter((p) => p.isPublished).length;
  console.log(`  -> ${formatNumber(publishedCount)} of ${formatNumber(reposToCheck.length)} checked repos are published npm packages.`);

  const raw: RawAccountData = {
    account,
    repos,
    recentIssues: issuesAndPrs.issues,
    recentPRs: issuesAndPrs.prs,
    npmPackages,
    generatedAt: new Date().toISOString(),
  };

  const digest = buildDigest(raw, { windowDays: args.windowDays });
  const markdown = renderMarkdown(digest);

  await mkdir(args.outDir, { recursive: true });
  const jsonPath = path.join(args.outDir, "digest.json");
  const mdPath = path.join(args.outDir, "digest.md");
  await writeFile(jsonPath, JSON.stringify(digest, null, 2), "utf8");
  await writeFile(mdPath, markdown, "utf8");

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsedSec}s. Wrote:`);
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
}

function handleFatal(err: unknown): void {
  if (err instanceof GithubApiError) {
    console.error(`\nGitHub API error: ${err.message}`);
  } else {
    console.error(`\nUnexpected error: ${(err as Error).message}`);
  }
  process.exitCode = 1;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
