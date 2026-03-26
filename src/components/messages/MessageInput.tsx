"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Paperclip, X, FileIcon } from "lucide-react";
import { EmojiPicker } from "./EmojiPicker";

export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
export const MAX_FILES = 5;
// Allow all file types in the picker (audio/video/images/docs/etc).
// Server-side limits are enforced by auth + size + file count constraints.
export const ACCEPTED_TYPES = "*/*";

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface SelectedFile {
  file: File;
  id: string;
  preview?: string;
}

interface MessageInputProps {
  onSend: (content: string, files?: File[]) => Promise<void>;
  onTyping?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  onTyping,
  disabled = false,
  placeholder = "Type a message...",
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up previews on unmount
  useEffect(() => {
    return () => {
      selectedFiles.forEach((sf) => {
        if (sf.preview) URL.revokeObjectURL(sf.preview);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSend =
    (content.trim().length > 0 || selectedFiles.length > 0) &&
    !isSending &&
    !disabled;

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      setError(null);
      const newFiles: SelectedFile[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (selectedFiles.length + newFiles.length >= MAX_FILES) {
          setError(`Maximum ${MAX_FILES} files per message`);
          break;
        }

        if (file.size > MAX_FILE_SIZE) {
          setError(`${file.name} exceeds 500MB limit`);
          continue;
        }

        const sf: SelectedFile = {
          file,
          id: crypto.randomUUID(),
        };

        if (isImageFile(file)) {
          sf.preview = URL.createObjectURL(file);
        }

        newFiles.push(sf);
      }

      setSelectedFiles((prev) => [...prev, ...newFiles]);

      // Reset so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [selectedFiles.length]
  );

  const removeFile = useCallback((id: string) => {
    setSelectedFiles((prev) => {
      const removed = prev.find((sf) => sf.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((sf) => sf.id !== id);
    });
  }, []);

  const handleSubmit = async () => {
    if (!canSend) return;

    setIsSending(true);
    setError(null);
    try {
      const files =
        selectedFiles.length > 0
          ? selectedFiles.map((sf) => sf.file)
          : undefined;
      await onSend(content.trim(), files);
      // Clean up previews
      selectedFiles.forEach((sf) => {
        if (sf.preview) URL.revokeObjectURL(sf.preview);
      });
      setContent("");
      setSelectedFiles([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      // Refocus input after sending
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [content]);

  return (
    <div className="flex flex-col gap-1 p-4 border-t border-border bg-card">
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* File chips */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2" data-testid="file-chips">
          {selectedFiles.map((sf) => (
            <div
              key={sf.id}
              className="flex items-center gap-1.5 bg-muted rounded-md px-2 py-1 text-xs max-w-[200px]"
            >
              {sf.preview ? (
                <img
                  src={sf.preview}
                  alt={sf.file.name}
                  className="h-6 w-6 rounded object-cover flex-shrink-0"
                />
              ) : (
                <FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{sf.file.name}</span>
              <span className="text-muted-foreground flex-shrink-0">
                {formatFileSize(sf.file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(sf.id)}
                className="ml-0.5 hover:text-destructive flex-shrink-0"
                aria-label={`Remove ${sf.file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        {/* Attach button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          disabled={disabled || isSending || selectedFiles.length >= MAX_FILES}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach files"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          onChange={handleFileSelect}
          className="hidden"
          data-testid="file-input"
        />

        <EmojiPicker
          onSelect={(emoji) => {
            setContent((prev) => prev + emoji);
            textareaRef.current?.focus();
          }}
          disabled={disabled || isSending}
        />

        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            onTyping?.();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isSending}
          className="min-h-[40px] max-h-[200px] resize-none"
          rows={1}
        />
        <Button
          onClick={handleSubmit}
          disabled={!canSend}
          size="icon"
          className="flex-shrink-0"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
