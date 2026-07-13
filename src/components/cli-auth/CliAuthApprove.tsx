"use client";

import { useState } from "react";

interface DeviceRequest {
  status: string;
  scope: string;
  client_name: string | null;
}

export function CliAuthApprove({
  code,
  request,
}: {
  code: string;
  request: DeviceRequest | null;
}) {
  const [codeInput, setCodeInput] = useState(code);
  const [state, setState] = useState<"idle" | "working" | "approved" | "denied" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(action: "approve" | "deny") {
    const c = codeInput.trim().toUpperCase();
    if (!c) {
      setMessage("Enter the code shown in your terminal.");
      return;
    }
    setState("working");
    setMessage("");
    try {
      const res = await fetch("/api/cli-auth/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: c, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(data.error || "Something went wrong.");
        return;
      }
      setState(action === "approve" ? "approved" : "denied");
    } catch {
      setState("error");
      setMessage("Network error — please try again.");
    }
  }

  const card = "rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900";

  if (state === "approved") {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold text-green-600">✓ Approved</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Your terminal is now signing in. You can close this tab.
        </p>
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold">Request denied</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">The command-line login was denied.</p>
      </div>
    );
  }

  const expired = request?.status === "expired";
  const alreadyHandled = request && request.status !== "pending" && !expired;
  const scopeLabel = request?.scope === "public" ? "public (read-only listings)" : "full";

  return (
    <div className={card}>
      <h1 className="text-xl font-semibold">Authorize command-line access</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-300">
        A command-line client
        {request?.client_name ? ` on “${request.client_name}”` : ""} is asking to sign in to your
        ugig account{request ? ` with ${scopeLabel} access` : ""}.
      </p>

      {expired && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          This request has expired — run <code>ugig login</code> again.
        </p>
      )}
      {alreadyHandled && (
        <p className="mt-3 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
          This request was already handled.
        </p>
      )}

      <label className="mt-4 block text-sm font-medium">Code from your terminal</label>
      <input
        value={codeInput}
        onChange={(e) => setCodeInput(e.target.value)}
        placeholder="XXXX-XXXX"
        autoComplete="off"
        spellCheck={false}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono tracking-widest uppercase dark:border-gray-700 dark:bg-gray-800"
      />
      {message && <p className="mt-2 text-sm text-red-600">{message}</p>}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          disabled={state === "working" || expired}
          onClick={() => submit("approve")}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {state === "working" ? "…" : "Approve"}
        </button>
        <button
          type="button"
          disabled={state === "working"}
          onClick={() => submit("deny")}
          className="rounded-md border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Deny
        </button>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Only approve this if you just ran <code>ugig login</code> yourself.
      </p>
    </div>
  );
}
