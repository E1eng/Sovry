"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, X, AlertCircle, Image as ImageIcon, CheckCircle, ExternalLink, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { registerIPAssetWithPolling, transformFormDataToMetadata } from "@/services/storyProtocolRegistration";

export interface IPMetadataFormData {
  name: string;
  symbol: string;
  description: string;
  image: File | null;
  imagePreview: string | null;
}

export interface IPMetadataFormProps {
  onSubmit?: (data: IPMetadataFormData & { ipId?: string }) => void;
  initialData?: Partial<IPMetadataFormData>;
  submitLabel?: string;
  onCancel?: () => void;
  enableRegistration?: boolean; // If true, show Step 2 registration
}

interface ValidationErrors {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SYMBOL_LENGTH = 10;

const BLOCK_EXPLORER_URL = "https://storyscan.xyz/tx/";

export default function IPMetadataForm({
  onSubmit,
  initialData,
  submitLabel = "Next",
  onCancel,
  enableRegistration = false,
}: IPMetadataFormProps) {
  const { primaryWallet } = useDynamicContext();
  const isConnected = !!primaryWallet;

  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<IPMetadataFormData>({
    name: initialData?.name || "",
    symbol: initialData?.symbol || "",
    description: initialData?.description || "",
    image: initialData?.image || null,
    imagePreview: initialData?.imagePreview || null,
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Registration state
  const [registrationStatus, setRegistrationStatus] = useState<'idle' | 'uploading' | 'registering' | 'confirming' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [ipId, setIpId] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const validateField = (field: keyof IPMetadataFormData, value: any): string | undefined => {
    switch (field) {
      case "name":
        if (!value || value.trim().length === 0) {
          return "Name is required";
        }
        if (value.trim().length < 2) {
          return "Name must be at least 2 characters";
        }
        return undefined;

      case "symbol":
        if (!value || value.trim().length === 0) {
          return "Symbol is required";
        }
        const symbolUpper = value.toUpperCase().trim();
        if (symbolUpper.length > MAX_SYMBOL_LENGTH) {
          return `Symbol must be ${MAX_SYMBOL_LENGTH} characters or less`;
        }
        if (!/^[A-Z0-9]+$/.test(symbolUpper)) {
          return "Symbol must contain only letters and numbers";
        }
        return undefined;

      case "description":
        if (!value || value.trim().length === 0) {
          return "Description is required";
        }
        if (value.trim().length < 10) {
          return "Description must be at least 10 characters";
        }
        return undefined;

      case "image":
        if (!value) {
          return "Image is required";
        }
        return undefined;

      default:
        return undefined;
    }
  };

  const validateForm = (): boolean => {
    const newErrors: ValidationErrors = {};

    const nameError = validateField("name", formData.name);
    if (nameError) newErrors.name = nameError;

    const symbolError = validateField("symbol", formData.symbol);
    if (symbolError) newErrors.symbol = symbolError;

    const descriptionError = validateField("description", formData.description);
    if (descriptionError) newErrors.description = descriptionError;

    const imageError = validateField("image", formData.image);
    if (imageError) newErrors.image = imageError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isFormValid = (): boolean => {
    return (
      formData.name.trim().length >= 2 &&
      formData.symbol.trim().length > 0 &&
      formData.symbol.trim().length <= MAX_SYMBOL_LENGTH &&
      /^[A-Z0-9]+$/.test(formData.symbol.toUpperCase().trim()) &&
      formData.description.trim().length >= 10 &&
      formData.image !== null
    );
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, name: value }));
    if (errors.name) {
      const error = validateField("name", value);
      setErrors((prev) => ({ ...prev, name: error }));
    }
  };

  const handleSymbolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().slice(0, MAX_SYMBOL_LENGTH);
    setFormData((prev) => ({ ...prev, symbol: value }));
    if (errors.symbol) {
      const error = validateField("symbol", value);
      setErrors((prev) => ({ ...prev, symbol: error }));
    }
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, description: value }));
    if (errors.description) {
      const error = validateField("description", value);
      setErrors((prev) => ({ ...prev, description: error }));
    }
  };

  const processImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === "string") {
          resolve(result);
        } else {
          reject(new Error("Failed to read image file"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to process image"));
      reader.readAsDataURL(file);
    });
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: any[]) => {
      // Handle rejected files
      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        if (rejection.errors) {
          const error = rejection.errors[0];
          if (error.code === "file-too-large") {
            setErrors((prev) => ({
              ...prev,
              image: "File size must be less than 5MB",
            }));
          } else if (error.code === "file-invalid-type") {
            setErrors((prev) => ({
              ...prev,
              image: "Only PNG, JPG, and WEBP images are allowed",
            }));
          } else {
            setErrors((prev) => ({
              ...prev,
              image: error.message || "Invalid file",
            }));
          }
        }
        return;
      }

      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      setIsProcessingImage(true);
      setErrors((prev) => ({ ...prev, image: undefined }));

      try {
        const preview = await processImage(file);
        setFormData((prev) => ({
          ...prev,
          image: file,
          imagePreview: preview,
        }));
      } catch (error) {
        setErrors((prev) => ({
          ...prev,
          image: error instanceof Error ? error.message : "Failed to process image",
        }));
      } finally {
        setIsProcessingImage(false);
      }
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  const handleRemoveImage = () => {
    setFormData((prev) => ({
      ...prev,
      image: null,
      imagePreview: null,
    }));
    setErrors((prev) => ({ ...prev, image: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      return;
    }

    // If registration is enabled, proceed to Step 2
    if (enableRegistration) {
      if (!isConnected || !primaryWallet) {
        setErrors((prev) => ({ ...prev, name: "Please connect your wallet first" }));
        return;
      }
      setCurrentStep(2);
      await handleRegistration();
    } else {
      // Original behavior: just call onSubmit
      if (onSubmit) {
        onSubmit(formData);
      }
    }
  };

  const handleRegistration = async () => {
    if (!primaryWallet || !formData.image) {
      setRegistrationError("Missing required data for registration");
      setRegistrationStatus('error');
      return;
    }

    try {
      setRegistrationError(null);
      setRegistrationStatus('uploading');

      // Transform form data to metadata format
      const walletAddress = primaryWallet.address;
      const { ipMetadata, nftMetadata } = await transformFormDataToMetadata(
        formData,
        walletAddress,
        walletAddress.slice(0, 8) // Use first 8 chars as creator name
      );

      // Register IP asset with polling
      const result = await registerIPAssetWithPolling(
        ipMetadata,
        nftMetadata,
        primaryWallet,
        (status) => {
          setRegistrationStatus(status);
        }
      );

      if (result.success) {
        setTxHash(result.txHash || null);
        setIpId(result.ipId || null);
        setRegistrationStatus('success');

        // Call onSubmit with ipId included
        if (onSubmit) {
          onSubmit({
            ...formData,
            ipId: result.ipId,
          });
        }
      } else {
        setRegistrationError(result.error || "Registration failed");
        setRegistrationStatus('error');
      }
    } catch (error) {
      console.error("Registration error:", error);
      setRegistrationError(
        error instanceof Error ? error.message : "Failed to register IP asset"
      );
      setRegistrationStatus('error');
    }
  };

  const handleRetry = () => {
    setRegistrationError(null);
    setRegistrationStatus('idle');
    setTxHash(null);
    setIpId(null);
    handleRegistration();
  };

  const handleBackToStep1 = () => {
    setCurrentStep(1);
    setRegistrationStatus('idle');
    setTxHash(null);
    setIpId(null);
    setRegistrationError(null);
  };

  // Step 2: Registration
  if (currentStep === 2 && enableRegistration) {
    return (
      <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-sovry-green" />
            Register IP on Story Protocol
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Registration Status */}
          {registrationStatus === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-sovry-green" />
              <p className="text-sm text-zinc-400">Uploading metadata to IPFS...</p>
            </div>
          )}

          {registrationStatus === 'registering' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-sovry-green" />
              <p className="text-sm text-zinc-400 font-medium">Registering IP on Story Protocol...</p>
            </div>
          )}

          {registrationStatus === 'confirming' && txHash && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4 py-4">
                <Loader2 className="h-8 w-8 animate-spin text-sovry-green" />
                <p className="text-sm text-zinc-400 font-medium">Waiting for transaction confirmation...</p>
              </div>
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Transaction Hash:</span>
                  <a
                    href={`${BLOCK_EXPLORER_URL}${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-sovry-green hover:underline"
                  >
                    <span className="font-mono">
                      {txHash.slice(0, 10)}...{txHash.slice(-8)}
                    </span>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {registrationStatus === 'success' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="p-3 bg-sovry-green/20 rounded-full border border-sovry-green/30">
                  <CheckCircle className="h-8 w-8 text-sovry-green" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-zinc-50">IP Registered Successfully!</p>
                  {ipId && (
                    <p className="text-sm text-zinc-400 mt-2 font-mono">
                      IP ID: {ipId.slice(0, 10)}...{ipId.slice(-8)}
                    </p>
                  )}
                </div>
              </div>

              {txHash && (
                <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Transaction Hash:</span>
                    <a
                      href={`${BLOCK_EXPLORER_URL}${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-sovry-green hover:underline"
                    >
                      <span className="font-mono">
                        {txHash.slice(0, 10)}...{txHash.slice(-8)}
                      </span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {registrationStatus === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-3">
                  <p className="font-medium">{registrationError || "Registration failed"}</p>
                  {txHash && (
                    <div className="pt-2 border-t border-zinc-700">
                      <p className="text-xs text-zinc-400 mb-2">Transaction Hash:</p>
                      <a
                        href={`${BLOCK_EXPLORER_URL}${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-sovry-green hover:underline"
                      >
                        <span className="font-mono">
                          {txHash.slice(0, 10)}...{txHash.slice(-8)}
                        </span>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                  <Button
                    onClick={handleRetry}
                    variant="outline"
                    size="sm"
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Back Button */}
          {(registrationStatus === 'idle' || registrationStatus === 'error') && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBackToStep1}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Form
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Step 1: Form
  return (
    <Card className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-sovry-green" />
          IP Metadata Collection
          {enableRegistration && (
            <span className="ml-auto text-sm text-zinc-400 font-normal">
              Step 1 of 2
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
              Name
            </Label>
            <Input
              id="name"
              type="text"
              value={formData.name}
              onChange={handleNameChange}
              onBlur={() => {
                const error = validateField("name", formData.name);
                setErrors((prev) => ({ ...prev, name: error }));
              }}
              placeholder="Enter IP name"
              className={cn(
                "bg-zinc-900 border border-zinc-800",
                errors.name && "border-sovry-pink focus-visible:ring-sovry-pink"
              )}
            />
            {errors.name && (
              <div className="flex items-center gap-2 text-sm text-sovry-pink">
                <AlertCircle className="h-4 w-4" />
                <span>{errors.name}</span>
              </div>
            )}
          </div>

          {/* Symbol Field */}
          <div className="space-y-2">
            <Label htmlFor="symbol" className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
              Symbol (Max {MAX_SYMBOL_LENGTH} chars)
            </Label>
            <Input
              id="symbol"
              type="text"
              value={formData.symbol}
              onChange={handleSymbolChange}
              onBlur={() => {
                const error = validateField("symbol", formData.symbol);
                setErrors((prev) => ({ ...prev, symbol: error }));
              }}
              placeholder="TOKEN"
              maxLength={MAX_SYMBOL_LENGTH}
              className={cn(
                "bg-zinc-900 border border-zinc-800 uppercase",
                errors.symbol && "border-sovry-pink focus-visible:ring-sovry-pink"
              )}
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-500">
                {formData.symbol.length}/{MAX_SYMBOL_LENGTH} characters
              </div>
              {errors.symbol && (
                <div className="flex items-center gap-2 text-sm text-sovry-pink">
                  <AlertCircle className="h-4 w-4" />
                  <span>{errors.symbol}</span>
                </div>
              )}
            </div>
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
              Description
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={handleDescriptionChange}
              onBlur={() => {
                const error = validateField("description", formData.description);
                setErrors((prev) => ({ ...prev, description: error }));
              }}
              placeholder="Enter a detailed description of your IP asset"
              rows={4}
              className={cn(
                "bg-zinc-900 border border-zinc-800",
                errors.description && "border-sovry-pink focus-visible:ring-sovry-pink"
              )}
            />
            {errors.description && (
              <div className="flex items-center gap-2 text-sm text-sovry-pink">
                <AlertCircle className="h-4 w-4" />
                <span>{errors.description}</span>
              </div>
            )}
          </div>

          {/* Image Upload Field */}
          <div className="space-y-2">
            <Label className="text-zinc-400 text-sm font-medium uppercase tracking-wide">
              Image (PNG, JPG, WEBP - Max 5MB)
            </Label>
            {formData.imagePreview ? (
              <div className="relative">
                <div className="relative w-full h-48 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
                  <img
                    src={formData.imagePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 p-2 bg-zinc-900/90 hover:bg-zinc-800 rounded-full border border-zinc-700 transition-colors"
                    aria-label="Remove image"
                  >
                    <X className="h-4 w-4 text-zinc-400" />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-zinc-900/90 rounded text-xs text-zinc-400 border border-zinc-700">
                    {formData.image?.name}
                  </div>
                </div>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  isDragActive
                    ? "border-sovry-green bg-sovry-green/10"
                    : "border-zinc-700 hover:border-zinc-600 bg-zinc-900/50",
                  errors.image && "border-sovry-pink"
                )}
              >
                <input {...getInputProps()} />
                {isProcessingImage ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-sovry-green" />
                    <p className="text-sm text-zinc-400">Processing image...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-zinc-400" />
                    <p className="text-sm text-zinc-50">
                      {isDragActive
                        ? "Drop the image here"
                        : "Drag & drop an image here, or click to select"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      PNG, JPG, WEBP (max 5MB)
                    </p>
                  </div>
                )}
              </div>
            )}
            {errors.image && (
              <div className="flex items-center gap-2 text-sm text-sovry-pink">
                <AlertCircle className="h-4 w-4" />
                <span>{errors.image}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="flex-1"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={!isFormValid() || isProcessingImage}
              className={cn("flex-1", !onCancel && "w-full")}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

