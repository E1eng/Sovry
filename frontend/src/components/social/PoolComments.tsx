"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PoolCommentsProps {
  tokenAddress: string;
}

// Simple local-only comment card for a pool. This is intentionally
// isolated so it can be wired to a real database later without
// touching the Recent Activity UI.
export function PoolComments({ tokenAddress }: PoolCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState<
    { id: number; text: string; createdAt: number }
  >([]);

  const handleAddComment = () => {
    const text = newComment.trim();
    if (!text) return;

    const now = Date.now();
    setComments((prev) => [
      { id: now, text, createdAt: now },
      ...prev,
    ]);
    setNewComment("");
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base sm:text-lg font-semibold">
          Comments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs sm:text-sm text-zinc-500">
          Local notes for this pool (not yet synced to a backend)
        </p>
        <div className="flex items-start gap-2">
          <textarea
            className="flex-1 min-h-[80px] bg-zinc-900/60 border border-zinc-800 rounded-md px-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            placeholder="Add a comment about this pool..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            className="text-xs sm:text-sm"
            onClick={handleAddComment}
            disabled={!newComment.trim()}
          >
            Post
          </Button>
        </div>

        {comments.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {comments.map((c) => (
              <div
                key={c.id}
                className="px-3 py-2 bg-zinc-900/70 rounded-md border border-zinc-800"
              >
                <p className="text-xs sm:text-sm text-zinc-100 whitespace-pre-wrap">
                  {c.text}
                </p>
                <span className="mt-1 block text-[11px] text-zinc-500">
                  {new Date(c.createdAt).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
