"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Check, ChevronRight, CircleUserRound, Loader2, RefreshCw, Scale, Settings2, Utensils } from "lucide-react";
import { MetricHeader } from "@/components/MetricHeader";
import { QuickLogBar } from "@/components/QuickLogBar";
import { TrendChart } from "@/components/TrendChart";
import { getDashboard, logWeight, recalculateAdaptiveTargets, type CombinedParseResult, type DashboardResponse } from "@/lib/api";

const USER_ID = Number(process.env.NEXT_PUBLIC_USER_ID ?? 1);
const TARGET_CALORIES = Number(process.env.NEXT_PUBLIC_TARGET_CALORIES ?? 2200);
const TARGET_ACTIVE = Number(process.env.NEXT_PUBLIC_TARGET_ACTIVE_CALORIES ?? 350);

function todayIso() { return new Date().toISOString().slice(0, 10); }

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
    if (!silent) setLoading(true); else setRefreshing(true);
    try { setDashboard(await getDashboard(USER_ID)); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "Backend unavailable"); } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const metrics = useMemo(() => {
    const days = dashboard?.days ?? [];
    let calories = 0; let active = 0; let protein = 0; let carbs = 0; let fat = 0;
    for (const day of days) for (const item of day.logged_items) {
      const payload = item.structured_json;
      const items = Array.isArray(payload.items) ? payload.items : [payload];
      for (const parsed of items) if (parsed && typeof parsed === "object") {
        const value = parsed as Record<string, unknown>;
        if (item.entry_type === "NUTRITION") { calories += Number(value.estimated_calories ?? 0); protein += Number(value.protein_g ?? 0); carbs += Number(value.carbs_g ?? 0); fat += Number(value.fat_g ?? 0); }
        if (item.entry_type === "ATHLETIC") active += Number(value.active_calories_burned ?? value.calories_burned ?? 0);
      }
    }
    return { calories, active, protein, carbs, fat };
  }, [dashboard]);

  async function saveWeight() {
    const parsed = Number(weight);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setWeightSaving(true);
    try { await logWeight({ user_id: USER_ID, date: todayIso(), metric_weight: parsed }); setWeight(""); await refresh(true); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save weight"); } finally { setWeightSaving(false); }
  }

  async function runAdaptive() {
    setAdaptiveBusy(true); setAdaptiveMessage("");
    try { const result = await recalculateAdaptiveTargets(USER_ID); setAdaptiveMessage(result.audit.reason); await refresh(true); } catch (caught) { setAdaptiveMessage(caught instanceof Error ? caught.message : "Could not recalculate"); } finally { setAdaptiveBusy(false); }
  }

  return <main className="min-h-screen px-4 pb-32 pt-7"><div className="mx-auto max-w-md">
    <header className="mb-7 flex items-center justify-between"><div><p className="mb-1 text-[10px] font-medium uppercase tracking-[0.24em] text-lime-300/80">Friday · September 18</p><h1 className="text-[28px] font-semibold tracking-[-0.04em] text-white">Good evening<span className="text-lime-300">.</span></h1></div><button aria-label="Profile" onClick={() => setActiveTab("profile")} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 transition active:scale-95"><CircleUserRound className="h-5 w-5" /></button></header>
    {error && <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-200">{error}. Check NEXT_PUBLIC_API_URL and the FastAPI server.</div>}
    {activeTab === "today" && <div className="space-y-4">
      <MetricHeader targetCalories={TARGET_CALORIES} consumedCalories={metrics.calories} targetActiveCalories={TARGET_ACTIVE} activeCalories={metrics.active} proteinGrams={metrics.protein} proteinTarget={150} carbsGrams={metrics.carbs} carbsTarget={220} fatGrams={metrics.fat} fatTarget={70} />
      <TrendChart days={dashboard?.days ?? []} velocity={dashboard?.weekly_weight_velocity ?? null} />
      <section className="rounded-[28px] border border-white/[0.07] bg-[#111111] p-5"><div className="mb-4 flex items-center justify-between"><div><p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">Today</p><h2 className="text-lg font-semibold text-white">Daily check-in</h2></div><CalendarDays className="h-4 w-4 text-zinc-600" /></div><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-teal-300/10 text-teal-200"><Scale className="h-4 w-4" /></div><input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveWeight(); }} placeholder="Weight in kg" className="h-10 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-lime-300/50" /><button onClick={() => void saveWeight()} disabled={weightSaving || !weight} className="h-10 rounded-xl bg-white px-4 text-xs font-semibold text-black transition active:scale-95 disabled:opacity-30">{weightSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</button></div></section>
      <section className="rounded-[28px] border border-white/[0.07] bg-[#111111] p-5"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-lime-300/10 text-lime-300"><Activity className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium text-white">Adaptive targets</p><p className="mt-1 truncate text-xs text-zinc-500">{adaptiveMessage || "Use this after a full week of data."}</p></div><button onClick={() => void runAdaptive()} disabled={adaptiveBusy} aria-label="Recalculate adaptive targets" className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-zinc-300 transition active:scale-95 disabled:opacity-40">{adaptiveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button></div></section>
      {parsedLog && <section className="rounded-[28px] border border-lime-300/20 bg-lime-300/[0.06] p-5"><div className="flex items-start gap-3"><div className="grid h-8 w-8 place-items-center rounded-full bg-lime-300 text-black"><Check className="h-4 w-4" /></div><div><p className="text-sm font-medium text-lime-100">{parsedLog.category === "NUTRITION" ? "Nutrition" : "Workout"} parsed</p><p className="mt-1 text-xs leading-5 text-lime-100/60">{parsedLog.raw_summary}</p></div></div></section>}
    </div>}
    {activeTab === "trends" && <div className="space-y-4"><TrendChart days={dashboard?.days ?? []} velocity={dashboard?.weekly_weight_velocity ?? null} /><div className="rounded-[28px] border border-white/[0.07] bg-[#111111] p-5"><p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500">Window totals</p><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/[0.04] p-4"><Utensils className="mb-3 h-4 w-4 text-lime-300" /><p className="font-mono text-xl text-white">{Math.round(dashboard?.total_calorie_intake ?? 0)}</p><p className="text-[10px] uppercase tracking-wider text-zinc-500">calories logged</p></div><div className="rounded-2xl bg-white/[0.04] p-4"><Activity className="mb-3 h-4 w-4 text-teal-300" /><p className="font-mono text-xl text-white">{Math.round(dashboard?.total_active_calories_burned ?? 0)}</p><p className="text-[10px] uppercase tracking-wider text-zinc-500">active burn</p></div></div></div></div>}
    {activeTab === "profile" && <div className="space-y-4"><section className="rounded-[28px] border border-white/[0.07] bg-[#111111] p-5"><p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-zinc-500">Profile</p><h2 className="text-lg font-semibold text-white">Your targets</h2><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between border-b border-white/[0.06] pb-3 text-zinc-400"><span>Daily calories</span><span className="font-mono text-white">{TARGET_CALORIES} kcal</span></div><div className="flex justify-between border-b border-white/[0.06] pb-3 text-zinc-400"><span>Active burn</span><span className="font-mono text-white">{TARGET_ACTIVE} kcal</span></div><div className="flex justify-between text-zinc-400"><span>Logged weight days</span><span className="font-mono text-white">{dashboard?.weight_days_logged ?? 0} / 7</span></div></div></section><button onClick={() => void refresh()} className="flex w-full items-center justify-between rounded-2xl border border-white/[0.07] bg-[#111111] px-4 py-4 text-sm text-zinc-300"><span className="flex items-center gap-3"><Settings2 className="h-4 w-4" /> Sync with backend</span>{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4 text-zinc-600" />}</button></div>}
    <nav className="fixed bottom-0 left-1/2 z-10 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-white/[0.07] bg-[#080808]/90 px-8 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 backdrop-blur-xl"><button onClick={() => setActiveTab("today")} className={`flex flex-col items-center gap-1 text-[10px] ${activeTab === "today" ? "text-lime-300" : "text-zinc-600"}`}><CalendarDays className="h-4 w-4" />Today</button><button onClick={() => setActiveTab("trends")} className={`flex flex-col items-center gap-1 text-[10px] ${activeTab === "trends" ? "text-lime-300" : "text-zinc-600"}`}><Activity className="h-4 w-4" />Trends</button><button onClick={() => setActiveTab("profile")} className={`flex flex-col items-center gap-1 text-[10px] ${activeTab === "profile" ? "text-lime-300" : "text-zinc-600"}`}><CircleUserRound className="h-4 w-4" />Profile</button></nav>
    {loading && <div className="fixed inset-0 z-30 grid place-items-center bg-[#050505]/80 backdrop-blur-sm"><div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#151515] px-4 py-3 text-xs text-zinc-300"><Loader2 className="h-4 w-4 animate-spin text-lime-300" />Loading your signal</div></div>}
    <QuickLogBar onParsed={setParsedLog} />
  </div></main>;
}
