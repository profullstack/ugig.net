"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";

interface AvatarUploadProps {
  avatarUrl: string | null;
  fallbackText: string;
}

export function AvatarUpload({ avatarUrl, fallbackText }: AvatarUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to upload avatar");
        setPreviewUrl(avatarUrl); // Revert preview on error
        return;
      }

      // Update preview with server URL
      setPreviewUrl(data.avatar_url);
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
      setPreviewUrl(avatarUrl); // Revert preview on error
    } finally {
      setIsLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar className="h-20 w-20">
          {previewUrl ? (
            <AvatarImage src={previewUrl} alt="Profile picture" />
          ) : (
            <AvatarFallback className="text-2xl">
              {fallbackText.charAt(0).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
      </div>
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          disabled={isLoading}
          className="block w-full text-sm text-muted-foreground
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-medium
            file:bg-primary file:text-primary-foreground
            hover:file:bg-primary/90
            file:cursor-pointer cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <p className="text-xs text-muted-foreground mt-2">
          JPG, PNG, WebP or GIF. Max 5MB.
        </p>
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
        )}
      </div>
    </div>
  );
}
