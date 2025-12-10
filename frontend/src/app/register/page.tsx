"use client";

import { useState } from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";

import {
  transformFormDataToMetadata,
  registerIPAssetWithPolling,
  mintLicenseToken,
  injectDemoRoyaltyWIP,
} from "@/services/storyProtocolRegistration";

export default function StoryIPPage() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ipId, setIpId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [licenseTxHash, setLicenseTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [injectingRoyalty, setInjectingRoyalty] = useState(false);

  const handleCreateIP = async () => {
    try {
      setError(null);
      setStatus(null);
      setIpId(null);
      setTxHash(null);
      setLicenseTxHash(null);

      if (!primaryWallet) {
        setShowAuthFlow(true);
        throw new Error("Please connect your wallet first");
      }

      if (!name.trim()) {
        throw new Error("Name is required");
      }

      if (!description.trim()) {
        throw new Error("Description is required");
      }

      if (!imageFile) {
        throw new Error("Image is required");
      }

      setLoading(true);
      setStatus("Uploading metadata to IPFS...");

      const { ipMetadata, nftMetadata } = await transformFormDataToMetadata(
        {
          name,
          symbol: name,
          description,
          image: imageFile,
          imagePreview: null,
        },
        primaryWallet.address,
        "Creator",
      );

      setStatus("Registering IP Asset on Story...");

      const registration = await registerIPAssetWithPolling(
        ipMetadata,
        nftMetadata,
        primaryWallet,
        (s) => {
          if (s === "uploading") setStatus("Uploading metadata to IPFS...");
          else if (s === "registering") setStatus("Registering IP Asset on Story...");
          else if (s === "confirming") setStatus("Waiting for transaction confirmation...");
          else if (s === "success") setStatus("IP Asset registered successfully");
        },
      );

      if (!registration.success || !registration.ipId) {
        throw new Error(registration.error || "Failed to register IP Asset");
      }

      setIpId(registration.ipId);
      setTxHash(registration.txHash || null);

      // Give Story a brief moment to index / recognize the newly registered IP
      setStatus("Waiting for Story to recognize the new IP (indexing)...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Use the license terms created during registration (PILFlavor.commercialRemix)
      const termsId = registration.licenseTermsId || "1";
      setStatus(`Minting default license token (termsId=${termsId})...`);

      const license = await mintLicenseToken(registration.ipId, termsId, primaryWallet);
      if (!license.success) {
        throw new Error(license.error || "Failed to mint license token");
      }

      setLicenseTxHash(license.txHash || null);
      setStatus("Done! IP + license created.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to create IP");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const handleInjectRoyalty = async () => {
    try {
      setError(null);

      if (!primaryWallet) {
        setShowAuthFlow(true);
        throw new Error("Please connect your wallet first");
      }

      if (!ipId) {
        throw new Error("No IP ID found. Create an IP first.");
      }

      setInjectingRoyalty(true);
      setStatus("Injecting WIP royalty into this IP's royalty vault...");

      const res = await injectDemoRoyaltyWIP(ipId, primaryWallet);
      if (!res.success) {
        throw new Error(res.error || "Failed to inject royalties");
      }

      setStatus("WIP royalty injected. You can now harvest via SovryLaunchpad.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to inject royalties");
      setStatus(null);
    } finally {
      setInjectingRoyalty(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Register IP and License on Story Protocol</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My awesome IP"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe your IP asset"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Image</Label>
            <FileUpload onChange={(files) => setImageFile(files[0] || null)} />
          </div>

          {status && (
            <div className="text-sm text-muted-foreground whitespace-pre-line">
              {status}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 whitespace-pre-line">
              {error}
            </div>
          )}

          {ipId && (
            <div className="space-y-1 text-sm break-all">
              <div>
                <span className="font-medium">IP ID:</span> {ipId}
              </div>
              {txHash && (
                <div>
                  <span className="font-medium">Register Tx:</span> {txHash}
                </div>
              )}
              {licenseTxHash && (
                <div>
                  <span className="font-medium">License Tx:</span> {licenseTxHash}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleCreateIP} disabled={loading}>
              {loading ? "Creating..." : "Create IP + License"}
            </Button>
            {ipId && (
              <Button
                variant="outline"
                onClick={handleInjectRoyalty}
                disabled={injectingRoyalty}
              >
                {injectingRoyalty ? "Injecting WIP..." : "Inject WIP Royalty"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
