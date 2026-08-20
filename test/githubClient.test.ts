import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapAccount, mapRepo, mapSearchIssue } from "../src/githubClient.js";

/**
 * These fixtures are real, unmodified (only trimmed to a handful of items)
 * JSON captured from live calls to the GitHub REST API against the
 * `expressjs` organization on 2026-08-20. No live network calls happen in
 * this test file — we're testing the pure mapping functions that turn raw
 * GitHub JSON into our normalized types.
 */
function loadFixture<T>(name: string): T {
  const filePath = path.join(__dirname, "fixtures", name);
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

describe("mapAccount", () => {
  it("maps a real organization response", () => {
    const raw = loadFixture<any>("github-org.json");
    const account = mapAccount(raw);
    expect(account.login).toBe("expressjs");
    expect(account.type).toBe("Organization");
    expect(account.publicRepos).toBeGreaterThan(0);
    expect(account.htmlUrl).toBe("https://github.com/expressjs");
  });

  it("defaults unknown account types to User", () => {
    const account = mapAccount({ login: "octocat", type: "Bot", html_url: "https://github.com/octocat", public_repos: 3 });
    expect(account.type).toBe("User");
  });
});

describe("mapRepo", () => {
  it("maps every real expressjs repo in the fixture without losing fields", () => {
    const raw = loadFixture<any[]>("github-repos.json");
    expect(raw.length).toBeGreaterThan(0);
    for (const rawRepo of raw) {
      const repo = mapRepo(rawRepo);
      expect(repo.name).toBe(rawRepo.name);
      expect(repo.fullName).toBe(rawRepo.full_name);
      expect(repo.stars).toBe(rawRepo.stargazers_count);
      expect(repo.forks).toBe(rawRepo.forks_count);
      expect(repo.openIssues).toBe(rawRepo.open_issues_count);
      expect(repo.pushedAt).toBe(rawRepo.pushed_at);
      expect(repo.isFork).toBe(rawRepo.fork);
      expect(repo.isArchived).toBe(rawRepo.archived);
    }
  });

  it("finds the real body-parser repo with plausible stats", () => {
    const raw = loadFixture<any[]>("github-repos.json");
    const bodyParser = raw.find((r) => r.name === "body-parser");
    expect(bodyParser).toBeDefined();
    const repo = mapRepo(bodyParser);
    expect(repo.stars).toBeGreaterThan(1000);
    expect(repo.language).toBe("JavaScript");
  });
});

describe("mapSearchIssue", () => {
  it("classifies real PR search results as kind: pr", () => {
    const raw = loadFixture<any>("github-search-prs.json");
    expect(raw.items.length).toBeGreaterThan(0);
    for (const item of raw.items) {
      const mapped = mapSearchIssue(item);
      expect(mapped.kind).toBe("pr");
      expect(mapped.repo).toBe(item.repository_url.split("/").pop());
      expect(mapped.number).toBe(item.number);
    }
  });

  it("classifies real issue search results as kind: issue", () => {
    const raw = loadFixture<any>("github-search-issues.json");
    expect(raw.items.length).toBeGreaterThan(0);
    for (const item of raw.items) {
      const mapped = mapSearchIssue(item);
      expect(mapped.kind).toBe("issue");
    }
  });

  it("falls back to 'unknown' author when user is null (e.g. deleted account)", () => {
    const mapped = mapSearchIssue({
      number: 1,
      title: "test",
      html_url: "https://github.com/expressjs/express/issues/1",
      user: null,
      created_at: "2026-08-01T00:00:00Z",
      state: "open",
      repository_url: "https://api.github.com/repos/expressjs/express",
    });
    expect(mapped.author).toBe("unknown");
  });
});
