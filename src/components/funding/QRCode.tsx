"use client";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - qrcode.react types resolve correctly at runtime but TS bundler resolution has issues
import { QRCodeCanvas as QRCodeReactCanvas } from "qrcode.react";

export function QRCodeCanvas({
  value,
  size = 256,
}: {
  value: string;
  size?: number;
}) {
  return (
    <div className="inline-block bg-white p-3 rounded-lg">
      <QRCodeReactCanvas value={value.toUpperCase()} size={size} level="M" />
    </div>
  );
}
