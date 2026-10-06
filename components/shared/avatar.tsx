"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const TINTS = [
  "bg-[#0F2A4A] text-white", // Navy
  "bg-[#0B7D7C] text-white", // Deep Teal
  "bg-[#1D4ED8] text-white", // Blue
  "bg-[#7C3AED] text-white", // Violet
  "bg-[#0369A1] text-white", // Sky
  "bg-[#047857] text-white", // Emerald
  "bg-[#B45309] text-white", // Amber
];

function getDeterministicTint(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TINTS.length;
  return TINTS[index];
}

function getInitials(name: string): string {
  const clean = name
    .trim()
    .replace(/^Dr\.\s*|^Prof\.\s*|^Mr\.\s*|^Ms\.\s*/i, "");
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const [imageError, setImageError] = React.useState(false);

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
  }[size];

  const initials = getInitials(name);
  const tint = getDeterministicTint(name);

  return (
    <div
      role="img"
      aria-label={`Avatar for ${name}`}
      className={cn(
        "relative rounded-full flex items-center justify-center font-medium overflow-hidden select-none shrink-0 border border-border/50",
        sizeClasses,
        tint,
        className
      )}
    >
      {src && !imageError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          onError={() => setImageError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}
