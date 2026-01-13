"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { WorkHistoryForm } from "./WorkHistoryForm";
import type { WorkHistory } from "@/types";
import { Plus, Pencil, Trash2, Briefcase } from "lucide-react";

export function WorkHistoryList() {
  const [workHistory, setWorkHistory] = useState<WorkHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkHistory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchWorkHistory = async () => {
    try {
      const response = await fetch("/api/work-history");
      const data = await response.json();
      if (response.ok) {
        setWorkHistory(data.work_history || []);
      }
    } catch {
      console.error("Failed to fetch work history");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkHistory();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this work history entry?")) {
      return;
    }

    setDeletingId(id);
    try {
      const response = await fetch(`/api/work-history/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setWorkHistory((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {
      console.error("Failed to delete work history");
    } finally {
      setDeletingId(null);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingItem(null);
    fetchWorkHistory();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-card rounded-lg border border-border">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/4" />
          <div className="h-20 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-card rounded-lg border border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Work History</h2>
        {!showForm && !editingItem && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        )}
      </div>

      {showForm && (
        <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30">
          <h3 className="font-medium mb-4">Add Work Experience</h3>
          <WorkHistoryForm
            onSuccess={handleFormSuccess}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {editingItem && (
        <div className="mb-6 p-4 border border-border rounded-lg bg-muted/30">
          <h3 className="font-medium mb-4">Edit Work Experience</h3>
          <WorkHistoryForm
            initialData={editingItem}
            onSuccess={handleFormSuccess}
            onCancel={() => setEditingItem(null)}
          />
        </div>
      )}

      {workHistory.length === 0 && !showForm ? (
        <div className="text-center py-8 text-muted-foreground">
          <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No work history added yet</p>
          <p className="text-sm mt-1">
            Add your work experience to help clients learn more about you
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {workHistory.map((item) => (
            <div
              key={item.id}
              className="p-4 border border-border rounded-lg hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{item.position}</h3>
                    {item.is_current && (
                      <span className="px-2 py-0.5 text-xs bg-green-500/10 text-green-600 rounded">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground">{item.company}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(item.start_date)} -{" "}
                    {item.is_current ? "Present" : item.end_date ? formatDate(item.end_date) : ""}
                    {item.location && ` · ${item.location}`}
                  </p>
                  {item.description && (
                    <p className="text-sm mt-2 text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingItem(item)}
                    disabled={Boolean(editingItem) || showForm}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
