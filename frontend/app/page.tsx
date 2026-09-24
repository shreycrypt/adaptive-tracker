"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Check, Loader2, RefreshCw, Scale, Settings2, Utensils, ArrowLeft, Plus, X } from "lucide-react";
import { MetricHeader } from "@/components/MetricHeader";
import { QuickLogBar } from "@/components/QuickLogBar";
import { TrendChart } from "@/components/TrendChart";
import { getDashboard, logWeight, recalculateAdaptiveTargets, type CombinedParseResult, type DashboardResponse } from "@/lib/api";

const USER_ID = Number(process.env.NEXT_PUBLIC_USER_ID ?? 1);
const todayIso = () => new Date().toISOString().slice(0, 10);
const getDynamicDateString = () => {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const month = now.toLocaleDateString("en-US", { month: "long" });
  const day = now.getDate();
  return `${weekday} · ${month} ${day}`;
};

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
  const [showBaselineWizard, setShowBaselineWizard] = useState(true); // Auto open wizard on load
  const [wizardStep, setWizardStep] = useState(1);

  // Questionnaire states
  const [qFocus, setQFocus] = useState("recomp");
  const [qCurrentWeight, setQCurrentWeight] = useState("75");
  const [qHeight, setQHeight] = useState("178");
  const [qAge, setQAge] = useState("25");
  const [qGender, setQGender] = useState("male");
  const [qNeat, setQNeat] = useState("lightly-active");
  const [qScheduleText, setQScheduleText] = useState("");
  const [qTrainingDays, setQTrainingDays] = useState("1-2");
  const [qComposition, setQComposition] = useState("15-20");
  const [qTargetWeight, setQTargetWeight] = useState("");
  const [qDietStyle, setQDietStyle] = useState("omnivore");
  const [qProteinTier, setQProteinTier] = useState("elite");
  const [qStepTarget, setQStepTarget] = useState("7500");
  const [qAdherenceObstacle, setQAdherenceObstacle] = useState("time-limits");

  // Dynamic targets based on questionnaire
  const dynamicTargets = useMemo(() => {
    const w = Number(qCurrentWeight) || 70;
    const h = Number(qHeight) || 175;
    const a = Number(qAge) || 25;
    let baseBmr = (10 * w) + (6.25 * h) - (5 * a);
    baseBmr += qGender === "male" ? 5 : -161;

    let activityMultiplier = 1.2, neatBurn = 200;
    if (qNeat === "lightly-active") { activityMultiplier = 1.375; neatBurn = 350; }
    if (qNeat === "highly-active") { activityMultiplier = 1.55; neatBurn = 550; }

    let calories = Math.round(baseBmr * activityMultiplier);
    if (qFocus === "fat-loss") calories -= 400;
    if (qFocus === "hypertrophy") calories += 300;
    if (qDietStyle === "low-carb") calories -= 50;

    const active = Math.max(neatBurn + Math.round(Number(qStepTarget) || 200) * 0.04, 150);
    return {
      calories: Math.max(calories, 1200),
      active: Math.max(active, 150),
    };
  }, [qFocus, qCurrentWeight, qHeight, qAge, qGender, qNeat, qDietStyle, qStepTarget]);

  // Fetch dashboard
  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      setDashboard(await getDashboard(USER_ID));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend unavailable");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // Calculate total metrics
  const metrics = useMemo(() => {
    const days = dashboard?.days ?? [];
    let cal = 0, active = 0, protein = 0, carbs = 0, fat = 0;
    for (const day of days) {
      for (const item of day.logged_items) {
        const payload = item.structured_json;
        const items = Array.isArray(payload.items) ? payload.items : [payload];
        for (const parsed of items) {
          if (parsed && typeof parsed === "object") {
            const v = parsed as Record<string, unknown>;
            if (item.entry_type === "NUTRITION") {
              cal += Number(v.estimated_calories ?? 0);
              protein += Number(v.protein_g ?? 0);
              carbs += Number(v.carbs_g ?? 0);
              fat += Number(v.fat_g ?? 0);
            }
          }
        }
      }
    }
    return { calories: cal, active, protein, carbs, fat };
  }, [dashboard]);

  async function saveWeight() {
    const parsed = Number(weight);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setWeightSaving(true);
    try {
      await logWeight({ user_id: USER_ID, date: todayIso(), metric_weight: parsed });
      setWeight("");
      await refresh(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save weight");
    } finally {
      setWeightSaving(false);
    }
  }

  async function runAdaptive() {
    setAdaptiveBusy(true); setAdaptiveMessage("");
    try {
      const result = await recalculateAdaptiveTargets(USER_ID);
      setAdaptiveMessage(result.audit.reason);
      await refresh(true);
    } catch (err) {
      setAdaptiveMessage(err instanceof Error ? err.message : "Could not recalculate");
    } finally {
      setAdaptiveBusy(false);
    }
  }

  // Wizard opens automatically
  useEffect(() => { setShowBaselineWizard(true); }, []);

  if (showBaselineWizard) {
    return (
      <main className="min-h-screen bg-[#050507] text-[#E4E4E7] font-sans flex flex-col items-center justify-start px-4 py-8 overflow-y-auto transition-all duration-500 ease-in-out">
        <div className="w-full max-w-xl bg-[#121215] border border-white/10 rounded-[24px] p-6 shadow-2xl relative animate-smooth-slide">
          {/* Header */}
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] tracking-wider uppercase text-emerald-400 font-bold font-num">ADAPTIVE TRACKER</p>
              <h2 className="text-2xl font-bold font-heading text-white mt-1">Edit your baseline.</h2>
              <p className="text-xs text-zinc-500 mt-1">Change options when goals or body change.</p>
            </div>
            <button onClick={() => setShowBaselineWizard(false)} className="p-1.5 rounded-lg border border-white/5 bg-white/[0.02] hover:text-white transition"><X className="h-4 w-4" /></button>
          </div>
          {/* Wizard Steps */}
          <div className="flex items-center gap-1 w-full my-6 overflow-x-auto pb-1 text-[9px] uppercase tracking-wider font-medium text-zinc-600 font-num">
            {["Focus", "Baseline", "NEAT", "Training", "Compo", "Destina", "Diet", "Protein", "Steps", "Adhere"].map((label, i) => (
              <span key={label} className={`px-2 py-0.5 rounded ${wizardStep === i + 1 ? 'text-emerald-400 border-b-2 border-emerald-400 font-bold' : ''}`}>{label}</span>
            ))}
          </div>
          {/* Content */}
          <div className="min-h-[280px] bg-white/[0.01] border border-white/5 rounded-2xl p-5 mb-6 transition-all duration-300 ease-in-out">
            <p className="text-xs text-zinc-500 mb-4 font-num font-medium">Question {wizardStep} of 10</p>
            {wizardStep === 1 && (
              <div className="space-y-3">
                {["fat-loss", "recomp", "hypertrophy"].map((opt) => (
                  <button key={opt} onClick={() => setQFocus(opt)} className={`w-full text-left p-4 rounded-xl border transition ${qFocus === opt ? "border-emerald-500 bg-emerald-500/5 text-white" : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"}`}>
                    <div className="font-semibold text-sm">{opt === "fat-loss" ? "Fat loss" : opt === "recomp" ? "Body recomp" : "Hypertrophy"}</div>
                    <div className="text-xs mt-0.5">{opt === "fat-loss" ? "A measured deficit." : opt === "recomp" ? "Build strength at maintenance." : "Fuel training and growth."}</div>
                  </button>
                ))}
              </div>
            )}
            {/* Additional steps like Baseline, NEAT, etc. as before, omitted for brevity but keep same structure */}
            {/* ... */}
          </div>
          {/* Navigation */}
          <div className="flex justify-between items-center border-t border-white/5 pt-4 transition-all duration-300 ease-in-out">
            <button disabled={wizardStep === 1} onClick={() => setWizardStep(prev => prev - 1)} className="text-xs font-semibold text-zinc-400 hover:text-white transition">← Back</button>
            {wizardStep < 10 ? (
              <button onClick={() => setWizardStep(prev => prev + 1)} className="h-10 px-5 rounded-xl bg-emerald-400 text-black text-xs font-bold transition hover:bg-emerald-300 active:scale-105 flex items-center gap-1"><span>Next</span> →</button>
            ) : (
              <button onClick={() => { setShowBaselineWizard(false); }} className="h-10 px-6 rounded-xl bg-white text-black text-xs font-bold transition hover:bg-zinc-200 active:scale-105">Save</button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Main Dashboard UI with sleek animations
  return (
    <main className="min-h-screen bg-[#050507] text-[#E4E4E7] font-sans relative px-4 pb-36 pt-7 transition-all duration-500 ease-in-out overflow-x-hidden">
      <div className="mx-auto max-w-md relative z-10">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="mb-1 text-[10px] tracking-[0.2em] uppercase text-zinc-500 font-num font-medium">{getDynamicDateString()}</p>
            <h1 className="text-3xl font-bold tracking-tight text-white font-heading">
              Good to see you<span className="text-emerald-400">.</span>
            </h1>
          </div>
          {activeTab !== "profile" ? (
            <button aria-label="Profile" onClick={() => setActiveTab("profile")} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#121215]/80 backdrop-blur-xl text-zinc-400 transition hover:border-white/20 hover:text-white"><CircleUserRound className="h-5 w-5" /></button>
          ) : (
            <button aria-label="Dashboard Back" onClick={() => setActiveTab("today")} className="flex items-center gap-2 h-9 px-3 rounded-lg border border-white/10 bg-[#121215]/80 backdrop-blur-xl text-xs font-medium text-zinc-400 transition hover:border-white/20 hover:text-white"><ArrowLeft className="h-4 w-4" /> <span>Dashboard</span></button>
          )}
        </header>
        {/* Error */}
        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-xs text-red-300 backdrop-blur-md">
            <span className="font-semibold text-red-400 block mb-0.5">Network Error</span>
            {error}
          </div>
        )}
        {/* Today Tab */}
        {activeTab === "today" && (
          <div className="space-y-4">
            {/* Metrics Header */}
            <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-2xl transition-all duration-500">
              <MetricHeader
                targetCalories={dynamicTargets.calories}
                consumedCalories={metrics.calories}
                targetActiveCalories={dynamicTargets.active}
                activeCalories={metrics.active}
                proteinGrams={metrics.protein}
                proteinTarget={150}
                carbsGrams={metrics.carbs}
                carbsTarget={220}
                fatGrams={metrics.fat}
                fatTarget={70}
              />
            </div>
            {/* Macro Bars */}
            <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl transition-all duration-500">
              {/* Macro bar components similar to previous */}
              {/* ... */}
            </div>
            {/* Trend Chart with smooth animation */}
            <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-1 shadow-xl transition-all duration-500">
              <TrendChart days={dashboard?.days ?? []} velocity={dashboard?.weekly_weight_velocity ?? null} />
            </div>
            {/* Weight logging */}
            <section className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl transition-all duration-500">
              {/* ... weight input ... */}
            </section>
            {/* Adaptive matrix */}
            <section className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl transition-all duration-500">
              {/* ... adaptive targets ... */}
            </section>
            {/* Log summary */}
            {parsedLog && (
              <section className="bg-emerald-950/20 border border-emerald-500/20 rounded-[24px] p-5 shadow-xl transition-all duration-500">
                {/* ... */}
              </section>
            )}
          </div>
        )}
        {/* Trends and Profile tabs (unchanged, keep minimal with transitions) */}
        {/* ... */}
        {/* Bottom nav and food log bar (unchanged, keep minimal) */}
      </div>
    </main>
  );
}
