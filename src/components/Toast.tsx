"use client";

import React, { useEffect, useCallback } from "react";

export type ToastType = "info" | "success" | "error" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  dismissing?: boolean;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  const dismissAfter = useCallback(
    (id: string) => {
      const timer = setTimeout(() => onDismiss(id), 4000);
      return timer;
    },
    [onDismiss]
  );

  useEffect(() => {
    const timers = toasts
      .filter((t) => !t.dismissing)
      .map((t) => dismissAfter(t.id));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissAfter]);

  if (toasts.length === 0) return null;

  const typeClass: Record<ToastType, string> = {
    info: "",
    success: "toast--success",
    error: "toast--error",
    warning: "toast--warning",
  };

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${typeClass[toast.type]} micro-echo ${
            toast.dismissing ? "toast--dismissing" : ""
          }`}
          role="status"
          aria-live="polite"
          onClick={() => onDismiss(toast.id)}
          style={{ cursor: "pointer" }}
        >
          <span className="tabular-mono" style={{ fontSize: 11 }}>
            {toast.type === "success" ? "\u2713" : toast.type === "error" ? "\u2717" : toast.type === "warning" ? "!" : "i"}
          </span>
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}