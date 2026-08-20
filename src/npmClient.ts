import type { NpmPackageInfo } from "./types.js";
import { mapWithConcurrency } from "./utils.js";

const REGISTRY_API = "https://registry.npmjs.org";
const DOWNLOADS_API = "https://api.npmjs.org/downloads/point/last-week";
const USER_AGENT = "portfolio-github-digest (https://github.com/) - keyless demo client";

interface RawRegistryPackage {
  name: string;
  "dist-tags"?: { latest?: string };
}

interface RawDownloadsResponse {
  downloads: number;
  package: string;
}

/**
 * Looks up a single repo name against the public npm registry. Returns
 * isPublished: false (not an error) for the very common case where a repo
 * simply isn't published as an npm package — a 404 here is expected data,
 * not a failure.
 */
export async function lookupNpmPackage(repoName: string): Promise<NpmPackageInfo> {
  const encoded = encodeURIComponent(repoName);
  const registryUrl = `${REGISTRY_API}/${encoded}`;

  let registryRes: Response;
  try {
    registryRes = await fetch(registryUrl, { headers: { "User-Agent": USER_AGENT } });
  } catch (err) {
    // Network hiccup on a single package shouldn't abort the whole digest —
    // treat it the same as "not found" but note it wasn't a clean 404.
    return { packageName: repoName, isPublished: false };
  }

  if (registryRes.status === 404) {
    return { packageName: repoName, isPublished: false };
  }
  if (!registryRes.ok) {
    return { packageName: repoName, isPublished: false };
  }

  const raw = (await registryRes.json()) as RawRegistryPackage;
  const latestVersion = raw["dist-tags"]?.latest;

  const info: NpmPackageInfo = {
    packageName: repoName,
    isPublished: true,
    latestVersion,
    npmUrl: `https://www.npmjs.com/package/${repoName}`,
    registryUrl,
  };

  // Download stats are a separate, independent endpoint — a failure here
  // shouldn't erase the fact that the package exists.
  try {
    const dlRes = await fetch(`${DOWNLOADS_API}/${encoded}`, { headers: { "User-Agent": USER_AGENT } });
    if (dlRes.ok) {
      const dl = (await dlRes.json()) as RawDownloadsResponse;
      info.weeklyDownloads = dl.downloads;
    }
  } catch {
    // leave weeklyDownloads undefined
  }

  return info;
}

/**
 * Cross-references a list of repo names against the npm registry, capping
 * concurrency so we don't fire dozens of simultaneous requests at once.
 * Returns a map keyed by repo name for every name checked.
 */
export async function lookupNpmPackages(
  repoNames: string[],
  concurrency = 6,
): Promise<Record<string, NpmPackageInfo>> {
  const results = await mapWithConcurrency(repoNames, concurrency, async (name) => [name, await lookupNpmPackage(name)] as const);
  return Object.fromEntries(results);
}
