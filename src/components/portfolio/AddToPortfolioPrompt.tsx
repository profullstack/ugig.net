"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PortfolioForm } from "./PortfolioForm";
import { Award, X } from "lucide-react";

interface AddToPortfolioPromptProps {
  gigId: string;
  gigTitle: string;
}

export function AddToPortfolioPrompt({
  gigId,
  gigTitle,
}: AddToPortfolioPromptProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [showForm, setShowForm] = useState(false);

  if (isDismissed) return null;

  if (showForm) {
    return (
      <div className="p-6 bg-card rounded-lg border border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-900/10">
        <h3 className="text-lg font-semibold mb-4">Add to Portfolio</h3>
        <PortfolioForm
          prefillGigId={gigId}
          prefillGigTitle={gigTitle}
          onSuccess={() => {
            setShowForm(false);
            setIsDismissed(true);
          }}
          onCancel={() => {
            setShowForm(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 bg-green-50/50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50 rounded-lg flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 dark:bg-green-800/30 rounded-lg">
          <Award className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <p className="font-medium text-sm">Gig completed! 🎉</p>
          <p className="text-xs text-muted-foreground">
            Add this project to your portfolio to showcase your work.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          onClick={() => setShowForm(true)}
          className="gap-1.5"
        >
          <Award className="h-3.5 w-3.5" />
          Add to Portfolio
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setIsDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
