"use client";

import { useQuery, QueryKey } from "@tanstack/react-query";
import { fetchIPMetadata, StoryIPMetadata } from "@/services/ipMetadata";

interface UseIPMetadataOptions {
  enabled?: boolean;
  queryKey?: QueryKey;
}

export function useIPMetadata(ipId?: string | null, options?: UseIPMetadataOptions) {
  return useQuery<StoryIPMetadata>({
    queryKey: options?.queryKey || ["ipMetadata", ipId?.toLowerCase() || "unknown"],
    queryFn: () => {
      if (!ipId) throw new Error("ipId is required to fetch metadata");
      return fetchIPMetadata(ipId);
    },
    enabled: options?.enabled ?? Boolean(ipId),
    staleTime: 5 * 60 * 1000,
  });
}
