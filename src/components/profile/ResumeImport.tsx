"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Check, AlertCircle, Loader2, Trash2, Save } from "lucide-react";

interface ParsedWorkHistory {
  company: string;
  position: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  location: string | null;
}

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
  parsed_work_history: ParsedWorkHistory[];
  _debug?: {
    text_length: number;
    text_preview: string;
    has_experience_section: boolean;
  };
}

export function ResumeImport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [workHistoryEntries, setWorkHistoryEntries] = useState<ParsedWorkHistory[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const handleFile = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setResult(null);
    setWorkHistoryEntries([]);
    setSavedCount(0);

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
      setWorkHistoryEntries(data.parsed_work_history || []);
      router.refresh(); // Refresh to update profile fields (name, bio, skills)
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const updateWorkHistoryEntry = (index: number, field: keyof ParsedWorkHistory, value: string | boolean | null) => {
    setWorkHistoryEntries(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeWorkHistoryEntry = (index: number) => {
    setWorkHistoryEntries(prev => prev.filter((_, i) => i !== index));
  };

  const saveAllWorkHistory = async () => {
    setIsSaving(true);
    setError(null);
    let saved = 0;

    try {
      for (const entry of workHistoryEntries) {
        if (!entry.company || !entry.position || !entry.start_date) continue;

        const response = await fetch("/api/work-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: entry.company,
            position: entry.position,
            description: entry.description,
            start_date: entry.start_date,
            end_date: entry.end_date,
            is_current: entry.is_current,
            location: entry.location,
          }),
        });

        if (response.ok) {
          saved++;
        }
      }

      setSavedCount(saved);
      setWorkHistoryEntries([]);
      router.refresh();
    } catch {
      setError("Failed to save some work history entries");
    } finally {
      setIsSaving(false);
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
            <span className="font-medium">Resume parsed successfully!</span>
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
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>Work history entries found: {result.imported.work_history_count}</span>
            </div>
          </div>

          {/* Debug info */}
          {result._debug && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Debug Info</summary>
              <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                <p>Text length: {result._debug.text_length}</p>
                <p>Has experience section: {result._debug.has_experience_section ? "Yes" : "No"}</p>
                <p className="mt-2">Text preview:</p>
                <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-40 bg-background p-2 rounded mt-1">
                  {result._debug.text_preview}
                </pre>
              </div>
            </details>
          )}

          {savedCount > 0 && workHistoryEntries.length === 0 && (
            <div className="mt-3 p-2 bg-green-500/20 rounded text-sm text-green-700">
              {savedCount} work history {savedCount === 1 ? "entry" : "entries"} saved!
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setResult(null);
              setError(null);
              setWorkHistoryEntries([]);
              setSavedCount(0);
            }}
          >
            Import another file
          </Button>
        </div>
      )}

      {/* Editable Work History Entries */}
      {workHistoryEntries.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              Work History ({workHistoryEntries.length} {workHistoryEntries.length === 1 ? "entry" : "entries"})
            </h3>
            <Button onClick={saveAllWorkHistory} disabled={isSaving} size="sm">
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save All
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Review and edit the parsed work history below, then click &quot;Save All&quot; to add them to your profile.
          </p>

          {workHistoryEntries.map((entry, index) => (
            <div key={index} className="p-4 border border-border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Entry {index + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeWorkHistoryEntry(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Company *</Label>
                  <Input
                    value={entry.company}
                    onChange={(e) => updateWorkHistoryEntry(index, "company", e.target.value)}
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <Label className="text-xs">Position *</Label>
                  <Input
                    value={entry.position}
                    onChange={(e) => updateWorkHistoryEntry(index, "position", e.target.value)}
                    placeholder="Job title"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Start Date *</Label>
                  <Input
                    type="date"
                    value={entry.start_date}
                    onChange={(e) => updateWorkHistoryEntry(index, "start_date", e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={entry.end_date || ""}
                    onChange={(e) => updateWorkHistoryEntry(index, "end_date", e.target.value || null)}
                    disabled={entry.is_current}
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={entry.is_current}
                      onChange={(e) => {
                        updateWorkHistoryEntry(index, "is_current", e.target.checked);
                        if (e.target.checked) {
                          updateWorkHistoryEntry(index, "end_date", null);
                        }
                      }}
                      className="rounded"
                    />
                    Current
                  </label>
                </div>
              </div>

              <div>
                <Label className="text-xs">Location</Label>
                <Input
                  value={entry.location || ""}
                  onChange={(e) => updateWorkHistoryEntry(index, "location", e.target.value || null)}
                  placeholder="City, State or Remote"
                />
              </div>

              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={entry.description || ""}
                  onChange={(e) => updateWorkHistoryEntry(index, "description", e.target.value || null)}
                  placeholder="Job responsibilities and achievements"
                  rows={3}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        We&apos;ll extract your name, bio, skills, and work history from your resume.
      </p>
    </div>
  );
}
