"use client";

import { FileIcon, Download, Play } from "lucide-react";
import type { Attachment } from "@/types";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(type: string): boolean {
  return /^image\/(jpeg|jpg|png|gif|webp|svg\+xml|bmp|tiff)$/i.test(type);
}

function isVideo(type: string): boolean {
  return /^video\/(mp4|webm|ogg|quicktime|x-msvideo|x-matroska)$/i.test(type);
}

function isAudio(type: string): boolean {
  return /^audio\/(mpeg|mp3|wav|ogg|webm|aac|flac|x-m4a|mp4)$/i.test(type);
}

function ImageAttachment({ attachment }: { attachment: Attachment }) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-1"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.url}
        alt={attachment.filename}
        className="max-w-full max-h-[400px] rounded-md object-cover cursor-pointer hover:opacity-90 transition-opacity"
        loading="lazy"
      />
    </a>
  );
}

function VideoAttachment({ attachment }: { attachment: Attachment }) {
  return (
    <div className="mt-1 max-w-full">
      <video
        src={attachment.url}
        controls
        preload="metadata"
        className="max-w-full max-h-[400px] rounded-md"
      >
        <track kind="captions" />
        Your browser does not support the video tag.
      </video>
      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
        <Play className="h-3 w-3" />
        <span className="truncate">{attachment.filename}</span>
        <span>· {formatFileSize(attachment.size)}</span>
      </div>
    </div>
  );
}

function AudioAttachment({ attachment }: { attachment: Attachment }) {
  return (
    <div className="mt-1 w-full min-w-[240px]">
      <audio src={attachment.url} controls preload="metadata" className="w-full h-10">
        Your browser does not support the audio tag.
      </audio>
      <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
        <span className="truncate">{attachment.filename}</span>
        <span>· {formatFileSize(attachment.size)}</span>
      </div>
    </div>
  );
}

function FileAttachment({ attachment }: { attachment: Attachment }) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      download={attachment.filename}
      className="flex items-center gap-2 mt-1 px-3 py-2 rounded-md bg-background/50 hover:bg-background/80 transition-colors text-xs"
    >
      <FileIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <span className="truncate min-w-0">{attachment.filename}</span>
      <span className="text-muted-foreground flex-shrink-0">
        {formatFileSize(attachment.size)}
      </span>
      <Download className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
    </a>
  );
}

export function MediaAttachment({ attachment }: { attachment: Attachment }) {
  if (isImage(attachment.type)) return <ImageAttachment attachment={attachment} />;
  if (isVideo(attachment.type)) return <VideoAttachment attachment={attachment} />;
  if (isAudio(attachment.type)) return <AudioAttachment attachment={attachment} />;
  return <FileAttachment attachment={attachment} />;
}
