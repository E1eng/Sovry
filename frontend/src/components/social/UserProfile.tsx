"use client";

import { useEffect, useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseClient";
import type { Profile } from "@/types/supabase";

const UserProfile = () => {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address?.toLowerCase();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!supabase || !walletAddress) return;
      setLoading(true);
      setError(null);
      setMessage(null);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("wallet_address, username, bio, avatar_url, created_at")
          .eq("wallet_address", walletAddress)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          const p = data as Profile;
          setProfile(p);
          setUsername(p.username || "");
          setBio(p.bio || "");
        } else {
          setProfile(null);
          setUsername("");
          setBio("");
        }
      } catch (err: any) {
        console.error("Failed to load profile", err);
        setError("Failed to load profile from Supabase");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [walletAddress]);

  const handleSave = async () => {
    if (!supabase || !walletAddress) return;

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        wallet_address: walletAddress,
        username: username.trim() || null,
        bio: bio.trim() || null,
      };

      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "wallet_address" });

      if (error) throw error;

      setMessage("Profile saved");
    } catch (err: any) {
      console.error("Failed to save profile", err);
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!walletAddress) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Social Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect your wallet to create a Sovry profile and attach a username to your comments.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Social Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Loading profile...</p>
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Wallet</p>
              <p className="font-mono text-xs break-all">{walletAddress}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Username</p>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. chillguy.eth"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Bio</p>
              <Input
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Producer, collector, IP explorer..."
                className="h-8 text-xs"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="text-xs"
              >
                {saving ? "Saving..." : "Save Profile"}
              </Button>
              {message && (
                <span className="text-[11px] text-emerald-400">{message}</span>
              )}
              {error && (
                <span className="text-[11px] text-red-400">{error}</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default UserProfile;
