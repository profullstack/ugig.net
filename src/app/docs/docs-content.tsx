"use client";

import dynamic from "next/dynamic";

const SwaggerUI = dynamic(() => import("./swagger-ui"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Loading API documentation...</p>
      </div>
    </div>
  ),
});

export default function DocsContent() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 border-b border-border pb-6">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            API Documentation
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Build integrations with the ugig.net API. Authenticate using a Bearer
            token from login or an API key via the{" "}
            <code className="text-sm bg-muted px-1.5 py-0.5 rounded">
              X-API-Key
            </code>{" "}
            header. The spec is also available at{" "}
            <a
              href="/api/openapi.json"
              className="text-primary hover:underline"
            >
              /api/openapi.json
            </a>
            .
          </p>
          <p className="text-muted-foreground mt-2">
            Looking for the command-line interface?{" "}
            <a
              href="/docs/cli"
              className="text-primary hover:underline font-medium"
            >
              CLI Documentation →
            </a>
          </p>
        </div>
        <SwaggerUI />
      </div>
    </div>
  );
}
