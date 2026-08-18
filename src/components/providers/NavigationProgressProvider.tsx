"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ProgressPhase = "idle" | "loading" | "completing";

interface NavigationProgressContextValue {
  startNavigation: () => void;
}

const NavigationProgressContext =
  createContext<NavigationProgressContextValue | null>(null);

/**
 * Keeps route-change feedback above the page tree so it remains visible while
 * a slow server-rendered destination is loading.
 */
export function NavigationProgressProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [phase, setPhase] = useState<ProgressPhase>("idle");
  const [progress, setProgress] = useState(0);
  const phaseRef = useRef<ProgressPhase>("idle");
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFinishTimer = useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  }, []);

  const startNavigation = useCallback(() => {
    clearFinishTimer();
    phaseRef.current = "loading";
    setPhase("loading");
    setProgress((current) => (current > 0 && current < 1 ? current : 0.08));
  }, [clearFinishTimer]);

  const completeNavigation = useCallback(() => {
    if (phaseRef.current === "idle") return;

    clearFinishTimer();
    phaseRef.current = "completing";
    setPhase("completing");
    setProgress(1);

    finishTimerRef.current = setTimeout(() => {
      phaseRef.current = "idle";
      setPhase("idle");
      setProgress(0);
      finishTimerRef.current = null;
    }, 180);
  }, [clearFinishTimer]);

  useEffect(() => {
    completeNavigation();
  }, [pathname, completeNavigation]);

  useEffect(() => {
    if (phase !== "loading") return;

    const interval = setInterval(() => {
      setProgress((current) => {
        const remaining = 0.9 - current;
        return Math.min(0.9, current + Math.max(remaining * 0.16, 0.012));
      });
    }, 320);

    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => clearFinishTimer, [clearFinishTimer]);

  return (
    <NavigationProgressContext.Provider value={{ startNavigation }}>
      <div
        aria-hidden="true"
        className="navigation-progress"
        data-phase={phase}
        style={{ transform: `scaleX(${progress})` }}
      />
      {children}
    </NavigationProgressContext.Provider>
  );
}

export function useNavigationProgress() {
  const context = useContext(NavigationProgressContext);

  if (!context) {
    throw new Error(
      "useNavigationProgress must be used within NavigationProgressProvider",
    );
  }

  return context;
}
