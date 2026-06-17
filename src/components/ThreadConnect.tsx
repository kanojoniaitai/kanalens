"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

interface Thread {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  opacity: number;
  born: number;
}

export default function ThreadConnect() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const idRef = useRef(0);
  const frameRef = useRef<number>(0);
  const activeRef = useRef(false);

  const startLoop = useCallback(() => {
    const tick = () => {
      const now = Date.now();
      setThreads((prev) => {
        const next = prev
          .map((t) => ({
            ...t,
            opacity: Math.max(0, t.opacity - 0.008),
          }))
          .filter((t) => now - t.born < 2000 && t.opacity > 0);
        if (next.length === 0) {
          activeRef.current = false;
          return [];
        }
        frameRef.current = requestAnimationFrame(tick);
        return next;
      });
    };
    frameRef.current = requestAnimationFrame(tick);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMouse({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  useEffect(() => {
    const handleHoverStart = (e: Event) => {
      const target = e.target as HTMLElement;
      const interactive = target.closest(
        'button, a, [role="button"], input, textarea, select, [data-thread]'
      );
      if (!interactive) return;

      const rect = interactive.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const id = ++idRef.current;
      const now = Date.now();
      setThreads((prev) => {
        const filtered = prev.filter((t) => now - t.born < 2000);
        const next = [...filtered, { id, x1: mouse.x, y1: mouse.y, x2: cx, y2: cy, opacity: 0.4, born: now }];
        if (!activeRef.current) {
          activeRef.current = true;
          startLoop();
        }
        return next;
      });
    };

    document.addEventListener("mouseover", handleHoverStart, { passive: true });
    return () => document.removeEventListener("mouseover", handleHoverStart);
  }, [mouse, startLoop]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  if (threads.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-[9999]"
    >
      {threads.map((t) => (
        <line
          key={t.id}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          className="thread-connect-line"
          style={{ opacity: t.opacity }}
        />
      ))}
    </svg>
  );
}
