"use client";

import { useState, useEffect, useCallback } from "react";
import { portfolio as portfolioApi } from "@/lib/api";
import { PortfolioCard } from "./PortfolioCard";
import { PortfolioForm } from "./PortfolioForm";
import { Button } from "@/components/ui/button";
import { Plus, FolderOpen } from "lucide-react";
import type { PortfolioItemWithGig } from "@/types";

interface PortfolioGridProps {
  userId: string;
  isOwner?: boolean;
}

export function PortfolioGrid({ userId, isOwner = false }: PortfolioGridProps) {
  const [items, setItems] = useState<PortfolioItemWithGig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PortfolioItemWithGig | null>(null);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    const result = await portfolioApi.list(userId);
    if (result.data) {
      setItems(
        (result.data as { portfolio_items: PortfolioItemWithGig[] }).portfolio_items || []
      );
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleEdit = (item: PortfolioItemWithGig) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this portfolio item?")) return;
    const result = await portfolioApi.delete(id);
    if (!result.error) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingItem(null);
    fetchItems();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingItem(null);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-48 bg-muted/50 rounded-lg animate-pulse border border-border"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add button for owner */}
      {isOwner && !showForm && (
        <div className="flex justify-end">
          <Button
            onClick={() => setShowForm(true)}
            size="sm"
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add Portfolio Item
          </Button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="p-6 bg-card rounded-lg border border-border">
          <h3 className="text-lg font-semibold mb-4">
            {editingItem ? "Edit Portfolio Item" : "Add Portfolio Item"}
          </h3>
          <PortfolioForm
            initialData={editingItem || undefined}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        </div>
      )}

      {/* Grid */}
      {items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <PortfolioCard
              key={item.id}
              item={item}
              isOwner={isOwner}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="text-center py-12">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {isOwner
                ? "No portfolio items yet. Add your first project!"
                : "No portfolio items to show."}
            </p>
          </div>
        )
      )}
    </div>
  );
}
