"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DialogState {
  open: boolean;
  kind: "alert" | "confirm";
  message: string;
  resolve: ((value: boolean) => void) | null;
}

interface DialogContextValue {
  alert: (message: string) => Promise<void>;
  confirm: (message: string) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>({
    open: false,
    kind: "alert",
    message: "",
    resolve: null,
  });

  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const show = useCallback(
    (kind: "alert" | "confirm", message: string): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setState({ open: true, kind, message, resolve });
        // showModal on next tick so the element is rendered
        requestAnimationFrame(() => {
          if (dialogRef.current?.showModal) {
            dialogRef.current.showModal();
          }
        });
      });
    },
    [],
  );

  const close = useCallback(
    (result: boolean) => {
      const resolver = resolveRef.current;
      resolveRef.current = null; // Clear before close to prevent re-entrancy via onClose
      if (dialogRef.current?.close) {
        dialogRef.current.close();
      }
      resolver?.(result);
      setState((s) => ({ ...s, open: false, resolve: null }));
    },
    [],
  );

  const alertFn = useCallback(
    async (message: string): Promise<void> => {
      await show("alert", message);
    },
    [show],
  );

  const confirmFn = useCallback(
    (message: string): Promise<boolean> => show("confirm", message),
    [show],
  );

  return (
    <DialogContext.Provider value={{ alert: alertFn, confirm: confirmFn }}>
      {children}

      {state.open && (
        <dialog
          ref={dialogRef}
          className="fixed inset-0 z-50 m-auto w-full max-w-md rounded-lg border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/50"
          onCancel={(e) => {
            e.preventDefault();
            close(false);
          }}
          onClose={() => {
            // Only resolve if not already handled (e.g. browser-native close)
            if (resolveRef.current) close(false);
          }}
        >
          <div className="flex flex-col gap-4 p-6">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {state.message}
            </p>

            <div className="flex justify-end gap-2">
              {state.kind === "confirm" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => close(false)}
                >
                  Cancel
                </Button>
              )}
              <Button
                variant={state.kind === "confirm" ? "default" : "default"}
                size="sm"
                onClick={() => close(state.kind === "confirm" ? true : false)}
                autoFocus
              >
                OK
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </DialogContext.Provider>
  );
}
