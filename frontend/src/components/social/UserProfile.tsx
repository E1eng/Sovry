"use client";

import React, { useRef, useState } from "react";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { supabase } from "@/lib/supabaseClient";

const AVATAR_BUCKET = "Profile Image"; // Make sure this bucket exists in Supabase

interface UserProfileProps {
  onClose?: () => void;
  onProfileUpdated?: (update: {
    username?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
  }) => void;
}

const UserProfile = ({ onClose, onProfileUpdated }: UserProfileProps) => {
  const { primaryWallet } = useDynamicContext();
  const walletAddress = primaryWallet?.address?.toLowerCase();

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase || !walletAddress) return;

    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError("Maximum file size is 2MB");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!validTypes.includes(file.type)) {
      setError("Only JPG, PNG, or GIF files are allowed");
      return;
    }

    setUploadingAvatar(true);
    setError(null);
    setMessage(null);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${walletAddress}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            wallet_address: walletAddress,
            avatar_url: publicUrl,
          },
          { onConflict: "wallet_address" }
        );

      if (profileError) throw profileError;

      setAvatarUrl(publicUrl);
      if (onProfileUpdated) {
        onProfileUpdated({ avatarUrl: publicUrl });
      }
      setMessage("Profile image updated");
    } catch (err: any) {
      console.error("Failed to upload avatar", err);
      setError(err.message || "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

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
      if (onProfileUpdated) {
        onProfileUpdated({ username: payload.username, bio: payload.bio });
      }
      if (onClose) {
        onClose();
      }
    } catch (err: any) {
      console.error("Failed to save profile", err);
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!walletAddress) {
    return (
      <div className="space-y-2 text-sm text-zinc-400">
        <p>Connect your wallet to create a Sovry profile and attach a username to your comments.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loading ? (
        <p className="text-sm text-zinc-400">Loading profile...</p>
      ) : (
        <>
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-zinc-200">Profile Details</h3>
            <p className="text-xs text-zinc-400">
              Edit and customize how your profile appears across Sovry.
            </p>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-zinc-200 flex items-center gap-1">
                <span>Username</span>
                <span className="text-sovry-crimson">*</span>
              </label>
              <span className="text-zinc-500">
                {username.trim().length}/15
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">@</span>
              <Input
                value={username}
                onChange={(e) => {
                  const value = e.target.value.slice(0, 15);
                  setUsername(value);
                }}
                placeholder="yourname"
                className="text-sm"
              />
            </div>
            <p className="text-[11px] text-zinc-500">
              Official username used for IP World.
            </p>
          </div>

          {/* Short Bio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-medium text-zinc-200 flex items-center gap-1">
                <span>Short Bio</span>
                <span className="text-sovry-crimson">*</span>
              </label>
              <span className="text-zinc-500">
                {bio.trim().length}/180
              </span>
            </div>
            <Input
              value={bio}
              onChange={(e) => {
                const value = e.target.value.slice(0, 180);
                setBio(value);
              }}
              placeholder="Provide a short bio about yourself"
              className="text-sm"
            />
          </div>

          {/* Profile Picture */}
          <div className="space-y-2">
            <div className="space-y-1 text-xs">
              <p className="font-medium text-zinc-200">Profile Picture</p>
              <p className="text-zinc-500">
                This will be displayed across the platform.
              </p>
            </div>
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-6 text-center cursor-pointer hover:border-sovry-crimson/60 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt="Profile avatar"
                  className="h-16 w-16 rounded-full object-cover border border-zinc-700"
                />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-200">Select Or Drag Media</p>
                <p className="text-[11px] text-zinc-500">
                  JPG, PNG, or GIF. - Max 2MB
                </p>
              </div>
              {uploadingAvatar && (
                <p className="text-[11px] text-zinc-400">Uploading...</p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 gap-2">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="font-mono truncate max-w-[140px] sm:max-w-[220px]">
                {walletAddress}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {error && (
                <span className="text-[11px] text-sovry-pink">{error}</span>
              )}
              {message && !error && (
                <span className="text-[11px] text-sovry-crimson">{message}</span>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="text-xs"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default UserProfile;