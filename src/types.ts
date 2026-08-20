/**
 * Shared data shapes used across the pipeline:
 *
 *   githubClient / npmClient  -->  RawAccountData  -->  digestBuilder  -->  DigestData  -->  reportRenderer
 *        (I/O, raw JSON)          (normalized)          (pure fn)         (aggregated)        (pure fn)
 *
 * Everything from RawAccountData onward is a plain object with no network
 * dependency, which is what makes digestBuilder and reportRenderer testable
 * with fixture JSON instead of live HTTP calls.
 */

export type AccountType = "User" | "Organization";

export interface RepoSummary {
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  pushedAt: string; // ISO 8601
  createdAt: string; // ISO 8601
  isFork: boolean;
  isArchived: boolean;
}

export type IssueOrPrKind = "issue" | "pr";

export interface IssueOrPr {
  kind: IssueOrPrKind;
  repo: string; // short repo name, e.g. "express"
  number: number;
  title: string;
  htmlUrl: string;
  author: string;
  createdAt: string; // ISO 8601
  state: string; // "open" | "closed"
}

export interface NpmPackageInfo {
  packageName: string;
  isPublished: boolean;
  latestVersion?: string;
  weeklyDownloads?: number;
  npmUrl?: string;
  registryUrl?: string;
}

export interface AccountInfo {
  login: string;
  type: AccountType;
  htmlUrl: string;
  publicRepos: number;
  followers?: number;
  description?: string | null;
}

/** Output of the fetch layer (githubClient + npmClient), before any aggregation. */
export interface RawAccountData {
  account: AccountInfo;
  repos: RepoSummary[];
  /** All issues found by the search query, unfiltered by window — digestBuilder filters. */
  recentIssues: IssueOrPr[];
  /** All PRs found by the search query, unfiltered by window — digestBuilder filters. */
  recentPRs: IssueOrPr[];
  /** Keyed by repo short name. Absent entry means "not checked" (e.g. over the --limit cap). */
  npmPackages: Record<string, NpmPackageInfo>;
  generatedAt: string; // ISO 8601, used as "now" for window filtering
}

export interface DigestTotals {
  totalRepos: number;
  totalStars: number;
  totalForks: number;
  totalOpenIssues: number;
  reposWithNpmPackage: number;
  totalWeeklyNpmDownloads: number;
  newIssues: number;
  newPRs: number;
}

export interface RepoWithNpm extends RepoSummary {
  npm?: NpmPackageInfo;
}

export interface DigestData {
  account: AccountInfo;
  windowDays: number;
  generatedAt: string;
  totals: DigestTotals;
  /** Repos touched most recently (by pushedAt), most recent first. */
  mostActiveRepos: RepoWithNpm[];
  /** Repos with a published npm package, sorted by weekly downloads descending. */
  topDownloaded: Array<RepoSummary & { npm: NpmPackageInfo }>;
  /** Issues opened within the window, most recent first. */
  recentIssues: IssueOrPr[];
  /** PRs opened within the window, most recent first. */
  recentPRs: IssueOrPr[];
}
