import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/reportRenderer.js";
import type { DigestData } from "../src/types.js";

function makeDigest(overrides: Partial<DigestData> = {}): DigestData {
  return {
    account: {
      login: "demo-org",
      type: "Organization",
      htmlUrl: "https://github.com/demo-org",
      publicRepos: 4,
      followers: 100,
      description: "demo",
    },
    windowDays: 7,
    generatedAt: "2026-08-20T12:00:00.000Z",
    totals: {
      totalRepos: 4,
      totalStars: 6710,
      totalForks: 431,
      totalOpenIssues: 16,
      reposWithNpmPackage: 2,
      totalWeeklyNpmDownloads: 2050000,
      newIssues: 1,
      newPRs: 2,
    },
    mostActiveRepos: [
      {
        name: "alpha",
        fullName: "demo-org/alpha",
        description: "The alpha package",
        htmlUrl: "https://github.com/demo-org/alpha",
        stars: 500,
        forks: 40,
        openIssues: 12,
        language: "TypeScript",
        pushedAt: "2026-08-19T09:00:00.000Z",
        createdAt: "2020-01-01T00:00:00.000Z",
        isFork: false,
        isArchived: false,
        npm: {
          packageName: "alpha",
          isPublished: true,
          latestVersion: "3.2.1",
          weeklyDownloads: 50000,
          npmUrl: "https://www.npmjs.com/package/alpha",
          registryUrl: "https://registry.npmjs.org/alpha",
        },
      },
    ],
    topDownloaded: [
      {
        name: "beta",
        fullName: "demo-org/beta",
        description: "The beta package",
        htmlUrl: "https://github.com/demo-org/beta",
        stars: 1200,
        forks: 90,
        openIssues: 3,
        language: "JavaScript",
        pushedAt: "2026-08-01T09:00:00.000Z",
        createdAt: "2019-05-01T00:00:00.000Z",
        isFork: false,
        isArchived: false,
        npm: {
          packageName: "beta",
          isPublished: true,
          latestVersion: "1.0.0",
          weeklyDownloads: 2000000,
          npmUrl: "https://www.npmjs.com/package/beta",
          registryUrl: "https://registry.npmjs.org/beta",
        },
      },
    ],
    recentIssues: [
      {
        kind: "issue",
        repo: "alpha",
        number: 42,
        title: "In-window issue",
        htmlUrl: "https://github.com/demo-org/alpha/issues/42",
        author: "alice",
        createdAt: "2026-08-18T00:00:00.000Z",
        state: "open",
      },
    ],
    recentPRs: [
      {
        kind: "pr",
        repo: "alpha",
        number: 100,
        title: "In-window PR",
        htmlUrl: "https://github.com/demo-org/alpha/pull/100",
        author: "carol",
        createdAt: "2026-08-19T00:00:00.000Z",
        state: "open",
      },
    ],
    ...overrides,
  };
}

describe("renderMarkdown", () => {
  it("includes the account name as the title", () => {
    const md = renderMarkdown(makeDigest());
    expect(md).toContain("# GitHub Digest: demo-org");
  });

  it("renders headline stats with thousands separators", () => {
    const md = renderMarkdown(makeDigest());
    expect(md).toContain("| Total stars | 6,710 |");
    expect(md).toContain("| Combined npm weekly downloads | 2,050,000 |");
  });

  it("renders most-active repos with their npm download count", () => {
    const md = renderMarkdown(makeDigest());
    expect(md).toContain("[alpha](https://github.com/demo-org/alpha)");
    expect(md).toContain("50,000");
  });

  it("shows an em dash for repos with no npm downloads instead of blank/undefined", () => {
    const digest = makeDigest();
    digest.mostActiveRepos = [{ ...digest.mostActiveRepos[0]!, npm: undefined }];
    const md = renderMarkdown(digest);
    expect(md).toMatch(/\| — \|/);
    expect(md).not.toContain("undefined");
  });

  it("renders the top-downloaded npm package table", () => {
    const md = renderMarkdown(makeDigest());
    expect(md).toContain("[beta](https://www.npmjs.com/package/beta)");
    expect(md).toContain("2,000,000");
  });

  it("renders recent issues and PRs as linked bullet points", () => {
    const md = renderMarkdown(makeDigest());
    expect(md).toContain("[alpha#42](https://github.com/demo-org/alpha/issues/42)");
    expect(md).toContain("opened by `alice`");
    expect(md).toContain("[alpha#100](https://github.com/demo-org/alpha/pull/100)");
  });

  it("shows a friendly empty state when there is no recent activity", () => {
    const digest = makeDigest({ recentIssues: [], recentPRs: [] });
    const md = renderMarkdown(digest);
    expect(md).toContain("_No new issues in this window._");
    expect(md).toContain("_No new pull requests in this window._");
  });

  it("shows a friendly empty state when no repos are published to npm", () => {
    const digest = makeDigest({ topDownloaded: [] });
    const md = renderMarkdown(digest);
    expect(md).toContain("_No published npm packages found among these repos._");
  });
});
