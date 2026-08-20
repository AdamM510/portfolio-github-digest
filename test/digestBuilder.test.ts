import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDigest } from "../src/digestBuilder.js";
import type { RawAccountData } from "../src/types.js";

function loadRawFixture(): RawAccountData {
  const filePath = path.join(__dirname, "fixtures", "raw-account-data.json");
  return JSON.parse(readFileSync(filePath, "utf8")) as RawAccountData;
}

describe("buildDigest", () => {
  it("filters issues and PRs to the given window and sorts newest first", () => {
    const raw = loadRawFixture();
    const digest = buildDigest(raw, { windowDays: 7 });

    // The fixture has one issue inside the 7-day window and one 7 weeks old.
    expect(digest.recentIssues).toHaveLength(1);
    expect(digest.recentIssues[0]?.number).toBe(42);

    // Both PRs are within the window; newest (08-19) should come first.
    expect(digest.recentPRs).toHaveLength(2);
    expect(digest.recentPRs[0]?.number).toBe(100);
    expect(digest.recentPRs[1]?.number).toBe(101);
  });

  it("widens or narrows the window when windowDays changes", () => {
    const raw = loadRawFixture();
    const wideDigest = buildDigest(raw, { windowDays: 90 });
    expect(wideDigest.recentIssues).toHaveLength(2); // both issues now fit

    const narrowDigest = buildDigest(raw, { windowDays: 1 });
    expect(narrowDigest.recentIssues).toHaveLength(0); // nothing created in the last 1 day
  });

  it("excludes archived repos from the most-active list", () => {
    const raw = loadRawFixture();
    const digest = buildDigest(raw);
    const names = digest.mostActiveRepos.map((r) => r.name);
    expect(names).not.toContain("gamma-archived");
  });

  it("sorts most-active repos by last push, most recent first", () => {
    const raw = loadRawFixture();
    const digest = buildDigest(raw);
    const names = digest.mostActiveRepos.map((r) => r.name);
    expect(names).toEqual(["alpha", "delta-no-npm", "beta"]);
  });

  it("attaches npm info to active repos that have a published package", () => {
    const raw = loadRawFixture();
    const digest = buildDigest(raw);
    const alpha = digest.mostActiveRepos.find((r) => r.name === "alpha");
    expect(alpha?.npm?.isPublished).toBe(true);
    expect(alpha?.npm?.weeklyDownloads).toBe(50000);

    const delta = digest.mostActiveRepos.find((r) => r.name === "delta-no-npm");
    expect(delta?.npm?.isPublished).toBe(false);
  });

  it("ranks topDownloaded by weekly downloads, only including published packages", () => {
    const raw = loadRawFixture();
    const digest = buildDigest(raw);
    expect(digest.topDownloaded.map((r) => r.name)).toEqual(["beta", "alpha"]);
    expect(digest.topDownloaded[0]?.npm.weeklyDownloads).toBe(2000000);
  });

  it("respects mostActiveLimit and topDownloadedLimit", () => {
    const raw = loadRawFixture();
    const digest = buildDigest(raw, { mostActiveLimit: 1, topDownloadedLimit: 1 });
    expect(digest.mostActiveRepos).toHaveLength(1);
    expect(digest.topDownloaded).toHaveLength(1);
  });

  it("computes correct totals across all repos, including archived ones", () => {
    const raw = loadRawFixture();
    const digest = buildDigest(raw);
    expect(digest.totals).toEqual({
      totalRepos: 4,
      totalStars: 6710,
      totalForks: 431,
      totalOpenIssues: 16,
      reposWithNpmPackage: 2,
      totalWeeklyNpmDownloads: 2050000,
      newIssues: 1,
      newPRs: 2,
    });
  });

  it("defaults to a 7-day window when no options are passed", () => {
    const raw = loadRawFixture();
    const digest = buildDigest(raw);
    expect(digest.windowDays).toBe(7);
  });
});
