"use client";

import React from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function GlassCard({ children, className = "", onClick }: GlassCardProps) {
  return (
  <div
  onClick={onClick}
  className={`
  ${onClick ? "vestige-card-interactive cursor-pointer" : "vestige-card"} text-sumi
  ${className}
  `}
  >
  {children}
  </div>
  );
}
