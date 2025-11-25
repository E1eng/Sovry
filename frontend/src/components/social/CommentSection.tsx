"use client";

import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import type { Comment as DbComment, Profile } from "@/types/supabase";

interface CommentWithProfile extends DbComment {
  username?: string | null;
}

interface CommentSectionProps {
  tokenAddress: string;
}

const shortenAddress = (addr: string) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Unknown";

const formatTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

const CommentSection = ({ tokenAddress }: CommentSectionProps) => {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address;

  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [value, setValue] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !tokenAddress) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadComments = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("comments")
          .select("id, token_address, user_address, content, created_at")
          .eq("token_address", tokenAddress)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = (data || []) as DbComment[];
        const uniqueUsers = Array.from(
          new Set(rows.map((c) => c.user_address.toLowerCase()))
        );

        let profilesByAddress: Record<string, Profile> = {};
        if (uniqueUsers.length > 0) {
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("wallet_address, username, bio, avatar_url, created_at")
            .in("wallet_address", uniqueUsers);

          (profilesData || []).forEach((p: any) => {
            profilesByAddress[(p.wallet_address as string).toLowerCase()] = p as Profile;
          });
        }

        if (!isMounted) return;

        const enriched: CommentWithProfile[] = rows.map((c) => {
          const prof = profilesByAddress[c.user_address.toLowerCase()];
          return {
            ...c,
            username: prof?.username ?? null,
          };
        });

        setComments(enriched);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Error loading comments from Supabase", err);
        setError("Failed to load comments");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadComments();

    const channel = supabase
      .channel(`comments:${tokenAddress}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `token_address=eq.${tokenAddress}`,
        },
        async (payload) => {
          const newRow = payload.new as DbComment;

          let username: string | null = null;
          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("username")
              .eq("wallet_address", newRow.user_address.toLowerCase())
              .maybeSingle();
            username = (profile as any)?.username ?? null;
          } catch {}

          setComments((prev) => [
            {
              ...newRow,
              username,
            },
            ...prev,
          ]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [tokenAddress]);

  const handlePost = async () => {
    const trimmed = value.trim();
    if (!trimmed || !walletAddress || !supabase) return;

    setPosting(true);
    try {
      const { error } = await supabase.from("comments").insert({
        token_address: tokenAddress,
        user_address: walletAddress.toLowerCase(),
        content: trimmed,
      });

      if (error) throw error;
      setValue("");
      // New comment will arrive via realtime subscription
    } catch (err: any) {
      console.error("Failed to post comment", err);
      setError(err.message || "Failed to post comment");
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card className="bg-background/80 border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span>Comments</span>
          {tokenAddress && (
            <span className="text-[11px] font-normal text-muted-foreground">
              Thread for {tokenAddress.slice(0, 6)}…{tokenAddress.slice(-4)}
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
              className="shrink-0"
            >
              Reply
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Connect your wallet to join the discussion.
          </p>
        )}

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No comments yet. Be the first to reply.</p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-primary">
                    {comment.username || shortenAddress(comment.user_address)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatTime(comment.created_at)}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {comment.content}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CommentSection;
