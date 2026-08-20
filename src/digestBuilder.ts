import type { DigestData, DigestTotals, IssueOrPr, RawAccountData, RepoWithNpm } from "./types.js";
import { daysAgo } from "./utils.js";

export interface BuildDigestOptions {
  /** How many days back counts as "recent". Defaults to 7. */
  windowDays?: number;
  /** How many repos to include in the "most active" list. Defaults to 8. */
  mostActiveLimit?: number;
  /** How many packages to include in the "top downloaded" list. Defaults to 5. */
  topDownloadedLimit?: number;
  /** How many issues/PRs to include in the report. Defaults to 10 each. */
  activityLimit?: number;
}

const DEFAULTS: Required<BuildDigestOptions> = {
  windowDays: 7,
  mostActiveLimit: 8,
  topDownloadedLimit: 5,
  activityLimit: 10,
};

function withinWindow(iso: string, windowDays: number, now: Date): boolean {
  return daysAgo(iso, now) <= windowDays && daysAgo(iso, now) >= 0;
}

function sortByCreatedDesc(items: IssueOrPr[]): IssueOrPr[] {
  return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Pure transformation: RawAccountData (already-fetched, normalized API data)
 * -> DigestData (aggregated stats + curated lists ready for rendering).
 * No network access, so this is the layer covered by unit tests using
 * fixture JSON.
 */
export function buildDigest(raw: RawAccountData, options: BuildDigestOptions = {}): DigestData {
  const opts = { ...DEFAULTS, ...options };
  const now = new Date(raw.generatedAt);

  const recentIssues = sortByCreatedDesc(raw.recentIssues.filter((i) => withinWindow(i.createdAt, opts.windowDays, now)));
  const recentPRs = sortByCreatedDesc(raw.recentPRs.filter((p) => withinWindow(p.createdAt, opts.windowDays, now)));

  const activeRepos = raw.repos.filter((r) => !r.isArchived);

  const totals: DigestTotals = {
    totalRepos: raw.repos.length,
    totalStars: sum(raw.repos.map((r) => r.stars)),
    totalForks: sum(raw.repos.map((r) => r.forks)),
    totalOpenIssues: sum(raw.repos.map((r) => r.openIssues)),
    reposWithNpmPackage: Object.values(raw.npmPackages).filter((p) => p.isPublished).length,
    totalWeeklyNpmDownloads: sum(Object.values(raw.npmPackages).map((p) => p.weeklyDownloads ?? 0)),
    newIssues: recentIssues.length,
    newPRs: recentPRs.length,
  };

  const mostActiveRepos: RepoWithNpm[] = [...activeRepos]
    .sort((a, b) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime())
    .slice(0, opts.mostActiveLimit)
    .map((r) => {
      const npm = raw.npmPackages[r.name];
      return npm ? { ...r, npm } : { ...r };
    });

  const topDownloaded = raw.repos
    .map((r) => {
      const npm = raw.npmPackages[r.name];
      return npm && npm.isPublished && typeof npm.weeklyDownloads === "number" ? { ...r, npm } : null;
    })
    .filter((x): x is RepoSummaryWithNpm => x !== null)
    .sort((a, b) => (b.npm.weeklyDownloads ?? 0) - (a.npm.weeklyDownloads ?? 0))
    .slice(0, opts.topDownloadedLimit);

  return {
    account: raw.account,
    windowDays: opts.windowDays,
    generatedAt: raw.generatedAt,
    totals,
    mostActiveRepos,
    topDownloaded,
    recentIssues: recentIssues.slice(0, opts.activityLimit),
    recentPRs: recentPRs.slice(0, opts.activityLimit),
  };
}

type RepoSummaryWithNpm = DigestData["topDownloaded"][number];

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0);
}
