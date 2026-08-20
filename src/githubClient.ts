import type { AccountInfo, AccountType, IssueOrPr, IssueOrPrKind, RepoSummary } from "./types.js";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "portfolio-github-digest (https://github.com/AdamM510/portfolio-github-digest) - keyless demo client";

export class GithubApiError extends Error {}
export class GithubNotFoundError extends GithubApiError {}
export class GithubRateLimitError extends GithubApiError {}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Thin wrapper around fetch() that turns GitHub's rate-limit and 404
 * responses into typed, human-readable errors instead of letting the
 * caller crash on an opaque JSON parse failure.
 */
async function githubFetch(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders() });
  } catch (err) {
    throw new GithubApiError(
      `Network error calling GitHub API at ${url}: ${(err as Error).message}. Check your internet connection.`,
    );
  }

  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      const resetHeader = res.headers.get("x-ratelimit-reset");
      const resetAt = resetHeader ? new Date(Number(resetHeader) * 1000) : null;
      const limit = res.headers.get("x-ratelimit-limit") ?? "60";
      const resetMsg = resetAt ? ` It resets at ${resetAt.toLocaleTimeString()}.` : "";
      throw new GithubRateLimitError(
        `GitHub API rate limit exceeded (limit: ${limit} requests/hour for ${
          process.env.GITHUB_TOKEN ? "authenticated" : "unauthenticated"
        } requests).${resetMsg} ` +
          `Set a GITHUB_TOKEN environment variable (any personal access token, no scopes needed for public data) to raise the limit to 5,000/hour.`,
      );
    }
  }

  if (res.status === 404) {
    throw new GithubNotFoundError(`GitHub account not found: ${url}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GithubApiError(`GitHub API returned ${res.status} for ${url}: ${body.slice(0, 300)}`);
  }

  return res;
}

/** Reads the rate-limit headers off any GitHub response, for status reporting. */
export function readRateLimitInfo(res: Response): { remaining: number; limit: number; resetAt: Date } | null {
  const remaining = res.headers.get("x-ratelimit-remaining");
  const limit = res.headers.get("x-ratelimit-limit");
  const reset = res.headers.get("x-ratelimit-reset");
  if (remaining === null || limit === null || reset === null) return null;
  return { remaining: Number(remaining), limit: Number(limit), resetAt: new Date(Number(reset) * 1000) };
}

// ---------------------------------------------------------------------------
// Raw GitHub API response shapes (only the fields we actually use)
// ---------------------------------------------------------------------------

interface RawGithubAccount {
  login: string;
  type: string;
  html_url: string;
  public_repos: number;
  followers?: number;
  description?: string | null;
  bio?: string | null;
}

interface RawGithubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  pushed_at: string;
  created_at: string;
  fork: boolean;
  archived: boolean;
}

interface RawGithubSearchIssue {
  number: number;
  title: string;
  html_url: string;
  user: { login: string } | null;
  created_at: string;
  state: string;
  repository_url: string; // e.g. https://api.github.com/repos/expressjs/express
  pull_request?: unknown; // present on PR results from the /search/issues endpoint
}

interface RawGithubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: RawGithubSearchIssue[];
}

// ---------------------------------------------------------------------------
// Pure mapping functions — exported so they can be unit tested against real
// captured GitHub API JSON without any network access.
// ---------------------------------------------------------------------------

export function mapAccount(raw: RawGithubAccount): AccountInfo {
  const type: AccountType = raw.type === "Organization" ? "Organization" : "User";
  return {
    login: raw.login,
    type,
    htmlUrl: raw.html_url,
    publicRepos: raw.public_repos,
    followers: raw.followers,
    description: raw.description ?? raw.bio ?? null,
  };
}

export function mapRepo(raw: RawGithubRepo): RepoSummary {
  return {
    name: raw.name,
    fullName: raw.full_name,
    description: raw.description,
    htmlUrl: raw.html_url,
    stars: raw.stargazers_count,
    forks: raw.forks_count,
    openIssues: raw.open_issues_count,
    language: raw.language,
    pushedAt: raw.pushed_at,
    createdAt: raw.created_at,
    isFork: raw.fork,
    isArchived: raw.archived,
  };
}

function repoNameFromApiUrl(repositoryUrl: string): string {
  // https://api.github.com/repos/{owner}/{repo} -> {repo}
  const parts = repositoryUrl.split("/");
  return parts[parts.length - 1] ?? repositoryUrl;
}

export function mapSearchIssue(raw: RawGithubSearchIssue): IssueOrPr {
  const kind: IssueOrPrKind = raw.pull_request ? "pr" : "issue";
  return {
    kind,
    repo: repoNameFromApiUrl(raw.repository_url),
    number: raw.number,
    title: raw.title,
    htmlUrl: raw.html_url,
    author: raw.user?.login ?? "unknown",
    createdAt: raw.created_at,
    state: raw.state,
  };
}

// ---------------------------------------------------------------------------
// I/O — the only functions in this file that actually call the network
// ---------------------------------------------------------------------------

/** Fetches account info and determines whether it's a user or an organization. */
export async function fetchAccount(name: string): Promise<AccountInfo> {
  const res = await githubFetch(`${GITHUB_API}/users/${encodeURIComponent(name)}`);
  const raw = (await res.json()) as RawGithubAccount;
  return mapAccount(raw);
}

/**
 * Fetches every public repo for the account, paginating at 100 per page.
 * Works for both user and organization accounts — GitHub serves both from
 * /users/{name}/repos, but organizations get richer data from /orgs/{name}/repos,
 * so we use that when we already know the account type.
 */
export async function fetchAllRepos(name: string, type: AccountType): Promise<RepoSummary[]> {
  const base = type === "Organization" ? `${GITHUB_API}/orgs/${name}/repos` : `${GITHUB_API}/users/${name}/repos`;
  const repos: RepoSummary[] = [];
  let page = 1;

  while (true) {
    const url = `${base}?per_page=100&sort=pushed&direction=desc&page=${page}`;
    const res = await githubFetch(url);
    const batch = (await res.json()) as RawGithubRepo[];
    repos.push(...batch.map(mapRepo));
    if (batch.length < 100) break; // last page
    page += 1;
    if (page > 20) break; // hard safety cap: 2,000 repos is plenty for a digest
  }

  return repos;
}

/**
 * Searches for issues or PRs created in the account's repos since `sinceIso`.
 * GitHub's /search/issues endpoint returns both issues and PRs; we filter by
 * kind after the fact using the presence of `pull_request` on each item.
 * Capped at 100 results (one page) — plenty for a weekly/monthly digest and
 * keeps this to a single call against the stricter search rate limit.
 */
export async function searchRecentIssuesAndPrs(
  name: string,
  type: AccountType,
  sinceIso: string,
): Promise<{ issues: IssueOrPr[]; prs: IssueOrPr[] }> {
  const scope = type === "Organization" ? `org:${name}` : `user:${name}`;
  const sinceDate = sinceIso.slice(0, 10);
  const q = encodeURIComponent(`${scope} created:>=${sinceDate}`);
  const url = `${GITHUB_API}/search/issues?q=${q}&per_page=100&sort=created&order=desc`;
  const res = await githubFetch(url);
  const raw = (await res.json()) as RawGithubSearchResponse;
  const mapped = raw.items.map(mapSearchIssue);
  return {
    issues: mapped.filter((i) => i.kind === "issue"),
    prs: mapped.filter((i) => i.kind === "pr"),
  };
}
