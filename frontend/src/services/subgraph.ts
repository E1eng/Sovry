import { getSubgraphUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function fetchSubgraph(query: string, variables?: Record<string, unknown>) {
  const url = typeof window === "undefined" ? getSubgraphUrl() : "/api/subgraph";

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  let json: any = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }

  if (!response.ok) {
    logger.warn("Subgraph request failed", { url, status: response.status, json });
  } else if (json?.errors?.length) {
    logger.warn("Subgraph request returned GraphQL errors", { url, errors: json.errors });
  }

  return { ok: response.ok, status: response.status, json };
}
