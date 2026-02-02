"use client";

import { useEffect, useRef } from "react";

export default function SwaggerUIComponent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Load Swagger UI from CDN
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SwaggerUIBundle = (window as any).SwaggerUIBundle;
      if (SwaggerUIBundle && containerRef.current) {
        SwaggerUIBundle({
          url: "/api/openapi.json",
          domNode: containerRef.current,
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIBundle.SwaggerUIStandalonePreset,
          ],
          layout: "BaseLayout",
          defaultModelsExpandDepth: 1,
          defaultModelExpandDepth: 2,
          docExpansion: "list",
          filter: true,
          showExtensions: true,
          tryItOutEnabled: false,
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup is not needed since we only initialize once
    };
  }, []);

  return (
    <div className="swagger-ui-wrapper">
      <div ref={containerRef} />
      <style jsx global>{`
        /* Dark theme overrides for Swagger UI */
        .swagger-ui-wrapper {
          min-height: 100vh;
        }

        .swagger-ui {
          font-family: inherit;
        }

        .swagger-ui .topbar {
          display: none;
        }

        /* Dark background */
        .swagger-ui,
        .swagger-ui .scheme-container,
        .swagger-ui .opblock-tag,
        .swagger-ui section.models,
        .swagger-ui section.models .model-container {
          background-color: hsl(240, 10%, 3.9%) !important;
          color: hsl(0, 0%, 90%) !important;
        }

        .swagger-ui .info {
          margin: 20px 0;
        }

        .swagger-ui .info .title {
          color: hsl(0, 0%, 98%) !important;
          font-size: 2rem;
        }

        .swagger-ui .info .description p,
        .swagger-ui .info .description,
        .swagger-ui .info li,
        .swagger-ui .info a {
          color: hsl(240, 5%, 64.9%) !important;
          font-size: 0.95rem;
        }

        .swagger-ui .info a {
          color: hsl(217.2, 91.2%, 59.8%) !important;
        }

        /* Operation blocks */
        .swagger-ui .opblock {
          border-color: hsl(240, 3.7%, 15.9%) !important;
          background: hsl(240, 5.9%, 10%) !important;
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .swagger-ui .opblock .opblock-summary {
          border-color: hsl(240, 3.7%, 15.9%) !important;
        }

        .swagger-ui .opblock .opblock-summary-description {
          color: hsl(240, 5%, 64.9%) !important;
        }

        .swagger-ui .opblock .opblock-summary-path,
        .swagger-ui .opblock .opblock-summary-path span {
          color: hsl(0, 0%, 90%) !important;
        }

        .swagger-ui .opblock-body {
          background: hsl(240, 5.9%, 10%) !important;
        }

        .swagger-ui .opblock .opblock-section-header {
          background: hsl(240, 3.7%, 15.9%) !important;
          border-color: hsl(240, 3.7%, 15.9%) !important;
        }

        .swagger-ui .opblock .opblock-section-header h4 {
          color: hsl(0, 0%, 90%) !important;
        }

        /* Tag sections */
        .swagger-ui .opblock-tag {
          border-color: hsl(240, 3.7%, 15.9%) !important;
          color: hsl(0, 0%, 98%) !important;
        }

        .swagger-ui .opblock-tag small {
          color: hsl(240, 5%, 64.9%) !important;
        }

        .swagger-ui .opblock-tag:hover {
          background: hsl(240, 3.7%, 15.9%) !important;
        }

        /* HTTP method colors - keep the defaults but darken backgrounds */
        .swagger-ui .opblock.opblock-get {
          background: rgba(97, 175, 254, 0.08) !important;
          border-color: rgba(97, 175, 254, 0.3) !important;
        }

        .swagger-ui .opblock.opblock-post {
          background: rgba(73, 204, 144, 0.08) !important;
          border-color: rgba(73, 204, 144, 0.3) !important;
        }

        .swagger-ui .opblock.opblock-put {
          background: rgba(252, 161, 48, 0.08) !important;
          border-color: rgba(252, 161, 48, 0.3) !important;
        }

        .swagger-ui .opblock.opblock-delete {
          background: rgba(249, 62, 62, 0.08) !important;
          border-color: rgba(249, 62, 62, 0.3) !important;
        }

        .swagger-ui .opblock.opblock-patch {
          background: rgba(80, 227, 194, 0.08) !important;
          border-color: rgba(80, 227, 194, 0.3) !important;
        }

        /* Table and parameters */
        .swagger-ui table thead tr th,
        .swagger-ui table thead tr td,
        .swagger-ui .parameter__name,
        .swagger-ui .parameter__type,
        .swagger-ui .parameter__in {
          color: hsl(0, 0%, 90%) !important;
        }

        .swagger-ui table tbody tr td {
          color: hsl(240, 5%, 64.9%) !important;
          border-color: hsl(240, 3.7%, 15.9%) !important;
        }

        .swagger-ui .parameters-col_description p,
        .swagger-ui .parameters-col_description input,
        .swagger-ui .parameters-col_description textarea {
          color: hsl(240, 5%, 64.9%) !important;
        }

        /* Models section */
        .swagger-ui section.models {
          border-color: hsl(240, 3.7%, 15.9%) !important;
        }

        .swagger-ui section.models h4 {
          color: hsl(0, 0%, 90%) !important;
        }

        .swagger-ui .model-title {
          color: hsl(0, 0%, 90%) !important;
        }

        .swagger-ui .model {
          color: hsl(240, 5%, 64.9%) !important;
        }

        .swagger-ui .prop-type {
          color: hsl(217.2, 91.2%, 59.8%) !important;
        }

        .swagger-ui .model-box {
          background: hsl(240, 5.9%, 10%) !important;
          border-color: hsl(240, 3.7%, 15.9%) !important;
        }

        /* Responses */
        .swagger-ui .responses-inner {
          background: transparent !important;
        }

        .swagger-ui .response-col_description,
        .swagger-ui .response-col_links {
          color: hsl(240, 5%, 64.9%) !important;
        }

        .swagger-ui .response-col_status {
          color: hsl(0, 0%, 90%) !important;
        }

        /* Code blocks */
        .swagger-ui .highlight-code,
        .swagger-ui .microlight {
          background: hsl(240, 5.9%, 10%) !important;
          color: hsl(0, 0%, 90%) !important;
          border-radius: 6px;
        }

        /* Inputs */
        .swagger-ui input[type="text"],
        .swagger-ui textarea,
        .swagger-ui select {
          background: hsl(240, 3.7%, 15.9%) !important;
          color: hsl(0, 0%, 90%) !important;
          border-color: hsl(240, 3.7%, 25%) !important;
          border-radius: 6px;
        }

        /* Authorize button */
        .swagger-ui .btn.authorize {
          color: hsl(142.1, 76.2%, 36.3%) !important;
          border-color: hsl(142.1, 76.2%, 36.3%) !important;
          background: transparent !important;
        }

        .swagger-ui .btn.authorize:hover {
          background: rgba(73, 204, 144, 0.1) !important;
        }

        /* Filter input */
        .swagger-ui .filter-container .filter input {
          background: hsl(240, 3.7%, 15.9%) !important;
          border-color: hsl(240, 3.7%, 25%) !important;
          color: hsl(0, 0%, 90%) !important;
        }

        /* Scrollbar */
        .swagger-ui ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }

        .swagger-ui ::-webkit-scrollbar-track {
          background: hsl(240, 5.9%, 10%);
        }

        .swagger-ui ::-webkit-scrollbar-thumb {
          background: hsl(240, 3.7%, 25%);
          border-radius: 4px;
        }

        /* Markdown content */
        .swagger-ui .markdown p,
        .swagger-ui .markdown li,
        .swagger-ui .renderedMarkdown p {
          color: hsl(240, 5%, 64.9%) !important;
        }

        /* Loading */
        .swagger-ui .loading-container {
          background: hsl(240, 10%, 3.9%) !important;
        }

        .swagger-ui .loading-container .loading::after {
          color: hsl(0, 0%, 90%) !important;
        }

        /* Expand arrows */
        .swagger-ui .expand-operation svg,
        .swagger-ui .model-toggle::after {
          fill: hsl(240, 5%, 64.9%) !important;
        }

        /* Server dropdown */
        .swagger-ui .servers > label {
          color: hsl(0, 0%, 90%) !important;
        }

        .swagger-ui .servers > label select {
          background: hsl(240, 3.7%, 15.9%) !important;
          color: hsl(0, 0%, 90%) !important;
          border-color: hsl(240, 3.7%, 25%) !important;
        }

        /* Schema section */
        .swagger-ui .model-box-control,
        .swagger-ui .models-control {
          color: hsl(0, 0%, 90%) !important;
        }

        /* Tab headers */
        .swagger-ui .tab li {
          color: hsl(240, 5%, 64.9%) !important;
        }

        .swagger-ui .tab li.active {
          color: hsl(0, 0%, 90%) !important;
        }

        /* JSON/Schema toggle */
        .swagger-ui .model-toggle {
          filter: invert(0.8);
        }

        /* Copy button */
        .swagger-ui .copy-to-clipboard {
          filter: invert(0.8);
        }

        /* Btn */
        .swagger-ui .btn {
          color: hsl(0, 0%, 90%) !important;
          border-color: hsl(240, 3.7%, 25%) !important;
        }

        .swagger-ui .btn:hover {
          background: hsl(240, 3.7%, 15.9%) !important;
        }

        /* No margin bottom on wrapper */
        .swagger-ui .wrapper {
          padding: 0 20px;
        }

        @media (min-width: 768px) {
          .swagger-ui .wrapper {
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
}
