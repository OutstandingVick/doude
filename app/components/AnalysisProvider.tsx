"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getHealth,
  getScenario,
  getReadings,
  runAnalysis,
  verify,
} from "@/lib/api";
import type {
  AnalyzeResponse,
  HealthResponse,
  ReadingsResponse,
  ScenarioResponse,
  VerifyResponse,
} from "@/lib/types";

interface AnalysisContextValue {
  health: HealthResponse | null;
  scenario: ScenarioResponse | null;
  readings: ReadingsResponse | null;
  analysis: AnalyzeResponse | null;
  verification: VerifyResponse | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  runAnalysis: () => Promise<void>;
}

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [scenario, setScenario] = useState<ScenarioResponse | null>(null);
  const [readings, setReadings] = useState<ReadingsResponse | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [verification, setVerification] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [h, s, r, a, v] = await Promise.all([
          getHealth(),
          getScenario(),
          getReadings(),
          runAnalysis(),
          verify(),
        ]);
        if (cancelled) return;
        setHealth(h);
        setScenario(s);
        setReadings(r);
        setAnalysis(a);
        setVerification(v);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not reach the engine",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRunAnalysis = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [a, r, v] = await Promise.all([
        runAnalysis(),
        getReadings(),
        verify(),
      ]);
      setAnalysis(a);
      setReadings(r);
      setVerification(v);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the engine",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <AnalysisContext.Provider
      value={{
        health,
        scenario,
        readings,
        analysis,
        verification,
        loading,
        refreshing,
        error,
        runAnalysis: handleRunAnalysis,
      }}
    >
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): AnalysisContextValue {
  const context = useContext(AnalysisContext);
  if (!context) {
    throw new Error("useAnalysis must be used within an AnalysisProvider");
  }
  return context;
}