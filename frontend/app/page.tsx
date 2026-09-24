"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Loader2,
  RefreshCw,
  Scale,
  Settings2,
  Utensils,
  ArrowLeft,
} from "lucide-react";

import { MetricHeader } from "@/components/MetricHeader";
import { QuickLogBar } from "@/components/QuickLogBar";
import { TrendChart } from "@/components/TrendChart";

import {
  getDashboard,
  logWeight,
  recalculateAdaptiveTargets,
  type CombinedParseResult,
  type DashboardResponse,
} from "@/lib/api";

const USER_ID = Number(process.env.NEXT_PUBLIC_USER_ID ?? 1);
const TARGET_CALORIES = Number(process.env.NEXT_PUBLIC_TARGET_CALORIES ?? 2200);
const TARGET_ACTIVE = Number(process.env.NEXT_PUBLIC_TARGET_ACTIVE_CALORIES ?? 350);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function HomePage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [weight, setWeight] = useState("");
  const [weightSaving, setWeightSaving] = useState(false);
  const [adaptiveBusy, setAdaptiveBusy] = useState(false);
  const [adaptiveMessage, setAdaptiveMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"today" | "trends" | "profile">("today");
  const [parsedLog, setParsedLog] = useState<CombinedParseResult | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      setDashboard(await getDashboard(USER_ID));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Backend unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const metrics = useMemo(() => {
    const days = dashboard?.days ?? [];
    let calories = 0, active = 0, protein = 0, carbs = 0, fat = 0;
    for (const day of days) {
      for (const item of day.logged_items) {
        const payload = item.structured_json;
        const items = Array.isArray(payload.items) ? payload.items : [payload];
        for (const parsed of items) {
          if (parsed && typeof parsed === "object") {
            const value = parsed as Record<string, unknown>;
            if (item.entry_type === "NUTRITION") {
              calories += Number(value.estimated_calories ?? 0);
              protein += Number(value.protein_g ?? 0);
              carbs += Number(value.carbs_g ?? 0);
              fat += Number(value.fat_g ?? 0);
            }
            if (item.entry_type === "ATHLETIC") {
              active += Number(value.active_calories_burned ?? value.calories_burned ?? 0);
            }
          }
        }
      }
    }
    return { calories, active, protein, carbs, fat };
  }, [dashboard]);

  async function saveWeight() {
    const parsed = Number(weight);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setWeightSaving(true);
    try {
      await logWeight({ user_id: USER_ID, date: todayIso(), metric_weight: parsed });
      setWeight("");
      await refresh(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save weight");
    } finally {
      setWeightSaving(false);
    }
  }

  async function runAdaptive() {
    setAdaptiveBusy(true);
    setAdaptiveMessage("");
    try {
      const result = await recalculateAdaptiveTargets(USER_ID);
      setAdaptiveMessage(result.audit.reason);
      await refresh(true);
    } catch (caught) {
      setAdaptiveMessage(caught instanceof Error ? caught.message : "Could not recalculate");
    } finally {
      setAdaptiveBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050507] text-[#E4E4E7] font-sans relative overflow-x-hidden px-4 pb-36 pt-7 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background glow rings */}
      <div className="absolute top-[-10%] left-[-20%] w-[80vw] h-[80vw] rounded-full bg-emerald-500/[0.03] blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-20%] w-[70vw] h-[70vw] rounded-full bg-blue-500/[0.03] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-amber-500/[0.02] blur-[100px] pointer-events-none" />

      <div className="mx-auto max-w-md relative z-10">
        {/* Header */}
        <header className="mb-7 flex items-center justify-between">
          <div>
            <p className="mb-1 text-[10px] tracking-[0.24em] uppercase text-emerald-400 font-num font-medium opacity-90">
              Friday · September 18
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white font-heading">
              Good evening<span className="text-emerald-400">.</span>
            </h1>
          </div>
          {activeTab !== "profile" ? (
            <button
              aria-label="Profile"
              onClick={() => setActiveTab("profile")}
              className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-[#121215]/80 backdrop-blur-xl text-zinc-400 shadow-xl transition-all duration-300 hover:border-white/20 hover:text-white active:scale-95"
            >
              <CircleUserRound className="h-5 w-5" />
            </button>
          ) : (
            <button
              aria-label="Back to Dashboard"
              onClick={() => setActiveTab("today")}
              className="flex items-center gap-2 h-10 px-3 rounded-lg border border-white/10 bg-[#121215]/80 backdrop-blur-xl text-xs font-medium text-zinc-400 shadow-xl transition-all duration-300 hover:border-white/20 hover:text-white active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Dashboard</span>
            </button>
          )}
        </header>

        {/* Error Banner */}
        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-950/20 backdrop-blur-xl px-4 py-3.5 text-xs text-red-300 shadow-2xl">
            <span className="font-semibold text-red-400 font-sans block mb-0.5">Network Connectivity Anomaly</span>
            {error}. Verify deployment environmental arrays and the FastAPI execution shell.
          </div>
        )}

        {/* Today View */}
        {activeTab === "today" && (
          <div className="space-y-5">
            {/* Progress Metrics */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-blue-500/5 rounded-[32px] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              <MetricHeader
                targetCalories={TARGET_CALORIES}
                consumedCalories={metrics.calories}
                targetActiveCalories={TARGET_ACTIVE}
                activeCalories={metrics.active}
                proteinGrams={metrics.protein}
                proteinTarget={150}
                carbsGrams={metrics.carbs}
                carbsTarget={220}
                fatGrams={metrics.fat}
                fatTarget={70}
              />
            </div>

            {/* Macro Progress */}
            <div className="p-5 rounded-[28px] border border-white/10 bg-[#121215]/80 backdrop-blur-xl shadow-2xl shadow-emerald-500/[0.02]">
              <h3 className="text-xs uppercase tracking-[0.15em] text-zinc-500 font-medium mb-4">Macro Nutrient Sub-Systems</h3>
              <div className="space-y-3.5">
                {/* Protein */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-zinc-400 font-medium">Protein Component</span>
                    <span className="font-num text-white">{Math.round(metrics.protein)}g / <span className="text-zinc-600">150g</span></span>
                  </div>
                  <div className="h-2 w-full bg-white/[0.03] border border-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#10B981] rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                      style={{ width: `${Math.min((metrics.protein / 150) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                {/* Carbohydrates */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-zinc-400 font-medium">Carbohydrate Payload</span>
                    <span className="font-num text-white">{Math.round(metrics.carbs)}g / <span className="text-zinc-600">220g</span></span>
                  </div>
                  <div className="h-2 w-full bg-white/[0.03] border border-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#3B82F6] rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                      style={{ width: `${Math.min((metrics.carbs / 220) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                {/* Fat */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-zinc-400 font-medium">Lipid Content (Fat)</span>
                    <span className="font-num text-white">{Math.round(metrics.fat)}g / <span className="text-zinc-600">70g</span></span>
                  </div>
                  <div className="h-2 w-full bg-white/[0.03] border border-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F59E0B] rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                      style={{ width: `${Math.min((metrics.fat / 70) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Trend Chart */}
            <div className="p-1 border border-white/10 bg-[#121215]/80 backdrop-blur-xl rounded-[28px] shadow-2xl">
              <TrendChart days={dashboard?.days ?? []} velocity={dashboard?.weekly_weight_velocity ?? null} />
            </div>

            {/* Weight Check-In */}
            <section className="rounded-[28px] border border-white/10 bg-[#121215]/80 backdrop-blur-xl p-5 shadow-2xl shadow-emerald-500/[0.03] hover:border-white/20 transition-all duration-300">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Daily Metrics Log</p>
                  <h2 className="text-lg font-bold text-white font-heading tracking-tight">Mass Check-In</h2>
                </div>
                <div className="h-8 w-8 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-center text-zinc-500">
                  <CalendarDays className="h-4 w-4" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300 shadow-[0_0_12px_rgba(45,212,191,0.15)]">
                  <Scale className="h-4 w-4" />
                </div>
                <input
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void saveWeight(); }}
                  placeholder="Metric weight (kg)"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 text-sm text-white font-num font-medium outline-none placeholder:text-zinc-600 transition-all focus:border-emerald-500/40 focus:bg-black/60 focus:ring-1 focus:ring-emerald-500/20"
                />
                <button
                  onClick={() => void saveWeight()}
                  disabled={weightSaving || !weight}
                  className="h-11 px-5 rounded-xl bg-white text-xs font-bold text-black transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-20 shadow-lg shadow-white/5"
                >
                  {weightSaving ? <Loader2 className="h-4 w-4 animate-spin text-black" /> : "Commit"}
                </button>
              </div>
            </section>

            {/* Adaptive Targets */}
            <section className="rounded-[28px] border border-white/10 bg-[#121215]/80 backdrop-blur-xl p-5 shadow-2xl shadow-emerald-500/[0.03] hover:border-white/20 transition-all duration-300">
              <div className="flex items-center gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white font-heading tracking-tight">Adaptive Target Engine</p>
                    <span className="text-[9px] font-num font-bold px-1.5 py-0.5 rounded-full text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                      ON TRACK
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500 leading-normal">
                    {adaptiveMessage || "Analytical tracking requires 7 baseline logs."}
                  </p>
                </div>
                <button
                  onClick={() => void runAdaptive()}
                  disabled={adaptiveBusy}
                  aria-label="Recalculate adaptive targets"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.02] text-zinc-400 transition-all hover:border-white/20 hover:text-white active:scale-95 disabled:opacity-30"
                >
                  {adaptiveBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* Trends View */}
        {activeTab === "trends" && (
          <div className="space-y-5">
            <div className="p-1 border border-white/10 bg-[#121215]/80 backdrop-blur-xl rounded-[28px] shadow-2xl">
              <TrendChart days={dashboard?.days ?? []} velocity={dashboard?.weekly_weight_velocity ?? null} />
            </div>
            <div className="rounded-[28px] border border-white/10 bg-[#121215]/80 backdrop-blur-xl p-5 shadow-2xl hover:border-white/20 transition-all duration-300">
              <p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Cumulative Window Arrays</p>
              <div className="grid grid-cols-2 gap-4">
                {/* Total Calorie Intake */}
                <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4 relative group overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-25 text-emerald-400">
                    <Utensils className="h-4 w-4" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Total Caloric Intake</p>
                  <p className="font-num text-3xl font-bold text-white tracking-tight">
                    {Math.round(dashboard?.total_calorie_intake ?? 0)}
                  </p>
                  <p className="text-[9px] text-zinc-600 font-num mt-1">kcal logging period</p>
                </div>
                {/* Active Expenditure */}
                <div className="rounded-2xl bg-white/[0.02] border border-white/5 p-4 relative group overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-25 text-blue-400">
                    <Activity className="h-4 w-4" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">Active Expenditure</p>
                  <p className="font-num text-3xl font-bold text-white tracking-tight">
                    {Math.round(dashboard?.total_active_calories_burned ?? 0)}
                  </p>
                  <p className="text-[9px] text-zinc-600 font-num mt-1">kcal kinetic burn</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profile Settings */}
        {activeTab === "profile" && (
          <div className="space-y-5">
            <section className="rounded-[28px] border border-white/10 bg-[#121215]/80 backdrop-blur-xl p-6 shadow-2xl hover:border-white/20 transition-all duration-300">
              <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium">User Engine Array</p>
              <h2 className="text-xl font-bold text-white font-heading tracking-tight">Static Variable Targets</h2>
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex justify-between border-b border-white/5 pb-3.5 text-zinc-400">
                  <span className="font-medium">Basal Target Matrix</span>
                  <span className="font-num text-white font-semibold">{TARGET_CALORIES} kcal</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-3.5 text-zinc-400">
                  <span className="font-medium">Kinetic Expenditure Goal</span>
                  <span className="font-num text-white font-semibold">{TARGET_ACTIVE} kcal</span>
                </div>
                <div className="flex justify-between pt-1 text-zinc-400">
                  <span className="font-medium">Committed Logs Balance</span>
                  <span className="font-num text-emerald-400 font-semibold">
                    {dashboard?.weight_days_logged ?? 0} <span className="text-zinc-600">/ 7 Days</span>
                  </span>
                </div>
              </div>
            </section>
            <button
              onClick={() => void refresh()}
              className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#121215]/80 backdrop-blur-xl px-5 py-4 text-sm font-medium text-zinc-300 shadow-xl transition-all duration-300 hover:border-white/20 hover:text-white active:scale-97"
            >
              <span className="flex items-center gap-3.5 text-zinc-300">
                <Settings2 className="h-4 w-4 text-emerald-400" /> Synchronise Core Systems
              </span>
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-zinc-600" />
              )}
            </button>
          </div>
        )}

        {/* Navigation Bar */}
        <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-white/10 bg-[#050507]/80 px-8 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 backdrop-blur-2xl shadow-[0_-15px_40px_rgba(0,0,0,0.7)]">
          {["today", "trends", "profile"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`flex flex-col items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase transition-all duration-300 ${
                activeTab === tab
                  ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab === "today" && <CalendarDays className="h-4 w-4" />}
              {tab === "trends" && <Activity className="h-4 w-4" />}
              {tab === "profile" && <CircleUserRound className="h-4 w-4" />}
              <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
            </button>
          ))}
        </nav>

        {/* Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-[#050507]/90 backdrop-blur-md transition-all duration-500">
            <div className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-[#121215]/90 backdrop-blur-xl px-5 py-4 text-xs font-medium text-zinc-300 shadow-2xl shadow-black/80">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400 stroke-[2.5]" />
              <span className="font-heading tracking-wide">Syncing network stream...</span>
            </div>
          </div>
        )}

        {/* Quick Log Bar */}
        <QuickLogBar onParsed={setParsedLog} />
      </div>
    </main>
  );
}
