import { getSubgraphUrl } from "@/lib/env";

export async function fetchSubgraph(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(getSubgraphUrl(), {
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

  return { ok: response.ok, status: response.status, json };
}
