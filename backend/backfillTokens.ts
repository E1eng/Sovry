import "./config/env";

import { querySubgraph } from "./services/subgraphService";
import { supabase } from "./services/supabaseClient";

type WrapperTokenRow = {
  id: string;
  rt: string;
  ipAsset: string;
  creator: string;
  launchTime: string;
};

type LaunchRow = {
  royalty_token_address: string;
  creator_address: string | null;
  ip_id?: string | null;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  created_at: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function fetchWrapperTokensByRt(rtAddresses: string[]): Promise<WrapperTokenRow[]> {
  const groups = chunk(Array.from(new Set(rtAddresses.map((a) => a.toLowerCase()).filter(Boolean))), 50);
  const all: WrapperTokenRow[] = [];

  for (const group of groups) {
    const query = `
      query WrappersByRt($rts: [String!]!) {
        wrapperTokens(where: { rt_in: $rts }) {
          id
          rt
          ipAsset
          creator
          launchTime
        }
      }
    `;

    try {
      const json = await querySubgraph<any>(query, { rts: group });
      if (json?.errors?.length) continue;
      const rows = (json?.data?.wrapperTokens || []) as WrapperTokenRow[];
      if (Array.isArray(rows) && rows.length > 0) all.push(...rows);
    } catch {
      // Best-effort fallback: don't fail the whole backfill if the subgraph
      // schema doesn't support this filter.
      continue;
    }
  }

  return all;
}

async function fetchWrapperTokensByIpAsset(ipAssets: string[]): Promise<WrapperTokenRow[]> {
  const groups = chunk(Array.from(new Set(ipAssets.map((a) => a.toLowerCase()).filter(Boolean))), 50);
  const all: WrapperTokenRow[] = [];

  for (const group of groups) {
    const query = `
      query WrappersByIpAsset($ips: [String!]!) {
        wrapperTokens(where: { ipAsset_in: $ips }) {
          id
          rt
          ipAsset
          creator
          launchTime
        }
      }
    `;

    try {
      const json = await querySubgraph<any>(query, { ips: group });
      if (json?.errors?.length) continue;
      const rows = (json?.data?.wrapperTokens || []) as WrapperTokenRow[];
      if (Array.isArray(rows) && rows.length > 0) all.push(...rows);
    } catch {
      continue;
    }
  }

  return all;
}

async function fetchAllWrapperTokens(): Promise<WrapperTokenRow[]> {
  const first = 200;
  let skip = 0;
  const all: WrapperTokenRow[] = [];

  while (true) {
    const query = `
      query WrapperTokens($first: Int!, $skip: Int!) {
        wrapperTokens(first: $first, skip: $skip, orderBy: launchTime, orderDirection: desc) {
          id
          rt
          ipAsset
          creator
          launchTime
        }
      }
    `;

    const json = await querySubgraph<any>(query, { first, skip });
    if (json?.errors?.length) {
      const firstErr = json.errors[0];
      throw new Error(firstErr?.message || "Subgraph query failed");
    }

    const rows = (json?.data?.wrapperTokens || []) as WrapperTokenRow[];
    if (!Array.isArray(rows) || rows.length === 0) break;

    all.push(...rows);
    if (rows.length < first) break;
    skip += first;
  }

  return all;
}

async function fetchAllLaunches(): Promise<LaunchRow[]> {
  const limit = 1000;
  let offset = 0;
  const all: LaunchRow[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("launches")
      .select("royalty_token_address, creator_address, name, symbol, image_url, created_at, ip_id")
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(error.message || "Failed to fetch launches from Supabase");
    }

    const rows = (Array.isArray(data) ? data : []) as any[];
    if (rows.length === 0) break;

    all.push(...(rows as LaunchRow[]));
    if (rows.length < limit) break;
    offset += limit;
  }

  return all;
}

async function fetchExistingTokenAddresses(wrapperAddresses: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  const chunks = chunk(wrapperAddresses, 500);

  for (const group of chunks) {
    const { data, error } = await supabase
      .from("tokens")
      .select("token_address")
      .in("token_address", group);

    if (error) {
      throw new Error(error.message || "Failed to fetch existing tokens");
    }

    if (!Array.isArray(data)) continue;
    for (const row of data as any[]) {
      const addr = String(row.token_address || "").toLowerCase();
      if (addr) existing.add(addr);
    }
  }

  return existing;
}

async function main() {
  const launches = await fetchAllLaunches();

  const launchRts = launches
    .map((l) => String((l as any).royalty_token_address || "").toLowerCase())
    .filter(Boolean);

  const launchIpAssets = launches
    .map((l) => String((l as any).ip_id || "").toLowerCase())
    .filter(Boolean);

  const [wrappersAll, wrappersByRt, wrappersByIp] = await Promise.all([
    fetchAllWrapperTokens(),
    fetchWrapperTokensByRt(launchRts),
    fetchWrapperTokensByIpAsset(launchIpAssets),
  ]);

  const wrapperMap = new Map<string, WrapperTokenRow>();
  for (const w of [...wrappersAll, ...wrappersByRt, ...wrappersByIp]) {
    const key = String(w.id || "").toLowerCase();
    if (!key) continue;
    if (!wrapperMap.has(key)) wrapperMap.set(key, w);
  }

  const wrappers = Array.from(wrapperMap.values());
  if (wrappers.length === 0) {
    console.log("[BACKFILL] No wrapper tokens found on subgraph");
    return;
  }

  const wrapperAddresses = wrappers
    .map((w) => String(w.id || "").toLowerCase())
    .filter(Boolean);

  const rtAddresses = wrappers
    .map((w) => String(w.rt || "").toLowerCase())
    .filter(Boolean);

  const launchesByRt = new Map<string, LaunchRow>();
  const launchesByIpAsset = new Map<string, LaunchRow>();

  for (const row of launches as any[]) {
    const rtKey = String((row as any).royalty_token_address || "").toLowerCase();
    if (rtKey) launchesByRt.set(rtKey, row as LaunchRow);

    const ipKey = String((row as any).ip_id || "").toLowerCase();
    if (ipKey) launchesByIpAsset.set(ipKey, row as LaunchRow);
  }

  const existing = await fetchExistingTokenAddresses(Array.from(new Set(wrapperAddresses)));

  const rowsToUpsert = wrappers
    .map((w) => {
      const token_address = String(w.id || "").toLowerCase();
      if (!token_address) return null;
      if (existing.has(token_address)) return null;

      const rt = String(w.rt || "").toLowerCase();
      const ipAsset = String(w.ipAsset || "").toLowerCase();
      const launch = (rt ? launchesByRt.get(rt) : undefined) || (ipAsset ? launchesByIpAsset.get(ipAsset) : undefined);

      const createdAtFromSubgraph = w.launchTime
        ? new Date(Number(w.launchTime) * 1000).toISOString()
        : new Date().toISOString();

      const base: any = {
        token_address,
        created_at: launch?.created_at ?? createdAtFromSubgraph,
      };

      if (launch?.name) base.name = launch.name;
      if (launch?.symbol) base.symbol = launch.symbol;
      if (launch?.image_url) base.image_uri = launch.image_url;

      const creatorCandidate = (launch?.creator_address || w.creator || "").toLowerCase();
      if (creatorCandidate) base.creator = creatorCandidate;

      return base as {
        token_address: string;
        name?: string;
        symbol?: string;
        image_uri?: string;
        creator?: string;
        created_at: string;
      };
    })
    .filter(Boolean) as Array<{
    token_address: string;
    name?: string;
    symbol?: string;
    image_uri?: string;
    creator?: string;
    created_at: string;
  }>;

  console.log(`[BACKFILL] wrappers=${wrappers.length} existing=${existing.size} to_upsert=${rowsToUpsert.length}`);

  if (rowsToUpsert.length === 0) {
    console.log("[BACKFILL] Nothing to upsert");
    return;
  }

  const upsertChunks = chunk(rowsToUpsert, 200);
  let inserted = 0;

  for (const group of upsertChunks) {
    const { error } = await supabase.from("tokens").upsert(group, { onConflict: "token_address" });
    if (error) {
      throw new Error(error.message || "Failed to upsert tokens");
    }
    inserted += group.length;
  }

  console.log(`[BACKFILL] Upserted ${inserted} tokens`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[BACKFILL] Failed:", err);
    process.exit(1);
  });
