"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Check, AlertCircle, Loader2 } from "lucide-react";

interface ImportResult {
  success: boolean;
  imported: {
    profile: boolean;
    full_name: string | null;
    bio: boolean;
    skills_count: number;
    skills: string[];
    location: string | null;
    work_history_count: number;
  };
}

export function ResumeImport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/profile/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to import profile");
        return;
      }

      setResult(data);
      router.refresh();
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
      ];

      if (!allowedTypes.includes(file.type)) {
        setError("Please upload a PDF or Word document");
        return;
      }

      handleFile(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <h2 className="text-lg font-semibold mb-2">Import Resume</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Upload your resume to auto-fill your profile and work history.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleFileChange}
        className="hidden"
      />

      {!result && (
        <div
          onClick={handleClick}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
            ${dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
            ${isLoading ? "pointer-events-none opacity-50" : ""}
          `}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Parsing your resume...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Drop your file here or click to upload</p>
              <p className="text-sm text-muted-foreground">PDF or Word document, max 5MB</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 text-sm text-destructive bg-destructive/10 rounded-md flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-green-600 mb-3">
            <Check className="h-5 w-5" />
            <span className="font-medium">Profile imported successfully!</span>
          </div>

          <div className="space-y-2 text-sm">
            {result.imported.full_name && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Name: {result.imported.full_name}</span>
              </div>
            )}
            {result.imported.bio && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Bio imported</span>
              </div>
            )}
            {result.imported.skills_count > 0 && (
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>{result.imported.skills_count} skills imported</span>
                </div>
                {result.imported.skills && result.imported.skills.length > 0 && (
                  <p className="text-xs text-muted-foreground ml-6 mt-1">
                    {result.imported.skills.slice(0, 5).join(", ")}
                    {result.imported.skills.length > 5 && "..."}
                  </p>
                )}
              </div>
            )}
            {result.imported.location && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Location: {result.imported.location}</span>
              </div>
            )}
            {result.imported.work_history_count > 0 && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>{result.imported.work_history_count} work history entries imported</span>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setResult(null);
              setError(null);
            }}
          >
            Import another file
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        We&apos;ll extract your name, bio, skills, and work history from your resume.
      </p>
    </div>
  );
}
