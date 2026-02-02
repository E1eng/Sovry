"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import { logger } from "@/lib/logger";
import { truncateAddress } from "@/lib/utils";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import type { Comment as DbComment, Profile } from "@/types/supabase";

interface CommentWithProfile extends DbComment {
  username?: string | null;
  avatarUrl?: string | null;
}

const PAGE_SIZE = 20;

interface CommentSectionProps {
  tokenAddress: string;
  tokenName?: string;
}

const shortenAddress = (addr: string) =>
  truncateAddress(addr, { separator: "…", fallback: "Unknown" });

const formatTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

export default function CommentSection({ tokenAddress, tokenName }: CommentSectionProps) {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address;

  const normalizedTokenAddress = tokenAddress?.toLowerCase() || "";

  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [value, setValue] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!supabase || !normalizedTokenAddress) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadInitialComments = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("comments")
          .select("id, token_address, user_address, content, created_at")
          .eq("token_address", normalizedTokenAddress)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE + 1);

        if (error) throw error;

        const rows = (data || []) as DbComment[];
        const pageRows = rows.slice(0, PAGE_SIZE);
        const uniqueUsers = Array.from(
          new Set(pageRows.map((c) => c.user_address.toLowerCase()))
        );

        let profilesByAddress: Record<string, Profile> = {};
        if (uniqueUsers.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from("profiles")
            .select("wallet_address, username, bio, avatar_url")
            .in("wallet_address", uniqueUsers);

          if (profilesError) {
            logger.error("Error loading profiles for comments", profilesError);
          }

          (profilesData as Profile[] | null | undefined)?.forEach((p) => {
            if (p?.wallet_address) {
              profilesByAddress[p.wallet_address.toLowerCase()] = p;
            }
          });
        }

        if (!isMounted) return;

        const enriched: CommentWithProfile[] = pageRows.map((c) => {
          const prof = profilesByAddress[c.user_address.toLowerCase()];
          return {
            ...c,
            username: prof?.username ?? null,
            avatarUrl: prof?.avatar_url ?? null,
          };
        });

        setComments(enriched);
        setHasMore(rows.length > PAGE_SIZE);
      } catch (err: any) {
        if (!isMounted) return;
        logger.error("Error loading comments from Supabase", err);
        setError("Failed to load comments");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadInitialComments();

    const channel = supabase
      .channel(`comments:${normalizedTokenAddress}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `token_address=eq.${normalizedTokenAddress}`,
        },
        async (payload: RealtimePostgresInsertPayload<DbComment>) => {
          const newRow = payload.new;

          let username: string | null = null;
          let avatarUrl: string | null = null;
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("username, avatar_url")
              .eq("wallet_address", newRow.user_address.toLowerCase())
              .maybeSingle();
            const p = profile as Pick<Profile, "username" | "avatar_url"> | null;
            username = p?.username ?? null;
            avatarUrl = p?.avatar_url ?? null;
          } catch {}

          setComments((prev) => {
            if (prev.some((c) => c.id === newRow.id)) {
              return prev;
            }
            return [
              {
                ...newRow,
                username,
                avatarUrl,
              },
              ...prev,
            ];
          });
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [normalizedTokenAddress]);

  const handleLoadMore = async () => {
    if (!supabase || !normalizedTokenAddress || loadingMore || comments.length === 0) return;

    setLoadingMore(true);
    setError(null);

    try {
      const oldest = comments[comments.length - 1];

      const { data, error } = await supabase
        .from("comments")
        .select("id, token_address, user_address, content, created_at")
        .eq("token_address", normalizedTokenAddress)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (error) throw error;

      const rows = (data || []) as DbComment[];
      const pageRows = rows.slice(0, PAGE_SIZE);

      const uniqueUsers = Array.from(
        new Set(pageRows.map((c) => c.user_address.toLowerCase()))
      );

      let profilesByAddress: Record<string, Profile> = {};
      if (uniqueUsers.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("wallet_address, username, bio, avatar_url")
          .in("wallet_address", uniqueUsers);

        if (profilesError) {
          logger.error("Error loading more profiles for comments", profilesError);
        }

        (profilesData as Profile[] | null | undefined)?.forEach((p) => {
          if (p?.wallet_address) {
            profilesByAddress[p.wallet_address.toLowerCase()] = p;
          }
        });
      }

      const enriched: CommentWithProfile[] = pageRows.map((c) => {
        const prof = profilesByAddress[c.user_address.toLowerCase()];
        return {
          ...c,
          username: prof?.username ?? null,
          avatarUrl: prof?.avatar_url ?? null,
        };
      });

      setComments((prev) => [...prev, ...enriched]);
      setHasMore(rows.length > PAGE_SIZE);
    } catch (err: any) {
      logger.error("Error loading more comments from Supabase", err);
      setError("Failed to load more comments");
    } finally {
      setLoadingMore(false);
    }
  };

  const handlePost = async () => {
    const trimmed = value.trim();
    if (!trimmed || !walletAddress || !supabase) return;

    setPosting(true);
    try {
      const userAddress = walletAddress.toLowerCase();

      // Ensure the user has a profile so we do not violate the foreign key constraint
      const { data: existingProfile, error: profileError } = await supabase
        .from("profiles")
        .select("wallet_address")
        .eq("wallet_address", userAddress)
        .maybeSingle();

      if (profileError) {
        logger.error("Failed to check profile before commenting", profileError);
        throw profileError;
      }

      if (!existingProfile) {
        setError("Please make a profile to comment.");
        return;
      }

      const { data: inserted, error } = await supabase
        .from("comments")
        .insert({
          token_address: normalizedTokenAddress,
          user_address: userAddress,
          content: trimmed,
        })
        .select("id, token_address, user_address, content, created_at")
        .single();

      if (error) throw error;

      let username: string | null = null;
      let avatarUrl: string | null = null;
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("wallet_address", userAddress)
          .maybeSingle();
        const p = profile as Pick<Profile, "username" | "avatar_url"> | null;
        username = p?.username ?? null;
        avatarUrl = p?.avatar_url ?? null;
      } catch {}

      const insertedRow = inserted as DbComment | null;
      if (insertedRow) {
        setComments((prev) => [
          {
            ...insertedRow,
            username,
            avatarUrl,
          },
          ...prev,
        ]);
      }

      setValue("");
    } catch (err: any) {
      logger.error("Failed to post comment", err);
      setError(err.message || "Failed to post comment");
    } finally {
      setPosting(false);
    }
  };

  const commentCountLabel =
    comments.length === 0
      ? "0"
      : hasMore
        ? `${comments.length}+`
        : `${comments.length}`;

  return (
    <Card className="bg-background/80 border-border/80">
      <CardHeader className="pb-4">
        <CardTitle className="text-base sm:text-lg font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>Comments</span>
            <span className="inline-flex items-center justify-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {commentCountLabel}
            </span>
          </span>
          {tokenAddress && (
            <span className="text-xs sm:text-sm font-normal text-muted-foreground">
              Thread for {tokenName || truncateAddress(tokenAddress, { separator: "…" })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {walletAddress ? (
          <div className="flex gap-2">
            <Input
              placeholder="Post a reply..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handlePost();
                }
              }}
            />
            <Button
              onClick={handlePost}
              disabled={posting || !value.trim()}
              className="shrink-0 text-sm px-4"
            >
              Reply
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Connect your wallet to join the discussion.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet. Be the first to reply.</p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-border/60 bg-card/60 px-4 py-3 text-sm space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {comment.avatarUrl ? (
                      <Image
                        src={comment.avatarUrl}
                        alt="Profile avatar"
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover border border-border/60"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted text-[11px] flex items-center justify-center text-muted-foreground">
                        {(comment.username || shortenAddress(comment.user_address))
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-primary text-sm sm:text-base">
                      {comment.username || shortenAddress(comment.user_address)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(comment.created_at)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {comment.content}
                </p>
              </div>
            ))
          )}
        </div>

        {!loading && comments.length > 0 && hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="h-8 px-4 text-xs sm:text-sm"
            >
              {loadingMore ? "Loading more..." : "Load older comments"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
