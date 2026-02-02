"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Briefcase, Edit, Trash2 } from "lucide-react";
import type { PortfolioItemWithGig } from "@/types";

interface PortfolioCardProps {
  item: PortfolioItemWithGig;
  isOwner?: boolean;
  onEdit?: (item: PortfolioItemWithGig) => void;
  onDelete?: (id: string) => void;
}

export function PortfolioCard({
  item,
  isOwner = false,
  onEdit,
  onDelete,
}: PortfolioCardProps) {
  return (
    <div className="group bg-card rounded-lg border border-border overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200">
      {/* Image */}
      {item.image_url && (
        <div className="relative w-full h-40 bg-muted">
          <Image
            src={item.image_url}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm line-clamp-2">{item.title}</h3>
          {isOwner && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onEdit?.(item)}
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                onClick={() => onDelete?.(item.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-3">
            {item.description}
          </p>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Footer links */}
        <div className="flex items-center gap-3 pt-1">
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View Project
            </a>
          )}
          {item.gig && (
            <a
              href={`/gigs/${item.gig.id}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Briefcase className="h-3 w-3" />
              {item.gig.title}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
