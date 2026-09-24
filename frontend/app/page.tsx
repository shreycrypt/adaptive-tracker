"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Check, ChevronRight, CircleUserRound, Loader2, RefreshCw, Scale, Settings2, Utensils, ArrowLeft, Plus, X } from "lucide-react";
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
  // State variables
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
  const [showBaselineWizard, setShowBaselineWizard] = useState(false);
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

  // Calculate dynamic targets based on questionnaire
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
            } else if (item.entry_type === "ATHLETIC") {
              active += Number(v.active_calories_burned ?? v.calories_burned ?? 0);
            }
          }
        }
      }
    }
    return { calories: cal, active, protein, carbs, fat };
  }, [dashboard]);

  // Save weight
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

  // Run adaptive recalculation
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

  // Render Baseline Wizard
  if (showBaselineWizard) {
    return (
      <main className="min-h-screen bg-[#050507] text-[#E4E4E7] font-sans flex flex-col items-center justify-start px-4 py-8 overflow-y-auto">
        <div className="w-full max-w-xl bg-[#121215] border border-white/10 rounded-[24px] p-6 shadow-2xl relative mt-4">
          {/* Header */}
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-[10px] tracking-wider uppercase text-emerald-400 font-bold font-num">ADAPTIVE TRACKER</p>
              <h2 className="text-2xl font-bold font-heading text-white mt-1">Edit your baseline.</h2>
              <p className="text-xs text-zinc-500 mt-1">Change options when goals or body change.</p>
            </div>
            <button onClick={() => setShowBaselineWizard(false)} className="p-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-zinc-400 hover:text-white transition"><X className="h-4 w-4" /></button>
          </div>
          {/* Wizard Steps Navigation */}
          <div className="flex items-center gap-1 w-full my-6 overflow-x-auto pb-1 text-[9px] uppercase tracking-wider font-medium text-zinc-600 font-num">
            {["Focus", "Baseline", "NEAT", "Training", "Compo", "Destina", "Diet", "Protein", "Steps", "Adhere"].map((label, i) => (
              <span key={label} className={`px-2 py-0.5 rounded ${wizardStep === i + 1 ? 'text-emerald-400 border-b-2 border-emerald-400 font-bold' : ''}`}>{label}</span>
            ))}
          </div>
          {/* Wizard Content */}
          <div className="min-h-[280px] bg-white/[0.01] border border-white/5 rounded-2xl p-5 mb-6">
            <p className="text-xs text-zinc-500 mb-4 font-num font-medium">Question {wizardStep} of 10</p>
            {wizardStep === 1 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white mb-3">Select your current energy focus:</h3>
                {["fat-loss", "recomp", "hypertrophy"].map((opt) => (
                  <button key={opt} onClick={() => setQFocus(opt)} className={`w-full text-left p-4 rounded-xl border transition ${qFocus === opt ? "border-emerald-500 bg-emerald-500/5 text-white" : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"}`}>
                    <div className="font-semibold text-sm">{opt === "fat-loss" ? "Fat loss" : opt === "recomp" ? "Body recomp" : "Hypertrophy"}</div>
                    <div className="text-xs mt-0.5">{opt === "fat-loss" ? "A measured deficit." : opt === "recomp" ? "Build strength at maintenance." : "Fuel training and growth."}</div>
                  </button>
                ))}
              </div>
            )}
            {wizardStep === 2 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-white">Input core metrics:</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "weight", value: qCurrentWeight, setter: setQCurrentWeight },
                    { label: "height", value: qHeight, setter: setQHeight },
                    { label: "age", value: qAge, setter: setQAge },
                  ].map(({ label, value, setter }) => (
                    <div key={label}>
                      <label className="block text-[11px] text-zinc-400 mb-1.5 font-medium">{label} (kg/cm)</label>
                      <input type="number" value={value} onChange={(e) => setter(e.target.value)} className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white outline-none focus:border-emerald-500/40 text-sm font-num" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1.5 font-medium">Gender</label>
                    <select value={qGender} onChange={(e) => setQGender(e.target.value)} className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white outline-none focus:border-emerald-500/40 text-sm transition">
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            {wizardStep === 3 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Choose your NEAT pattern:</h3>
                {["sedentary", "lightly-active", "highly-active"].map((opt) => (
                  <button key={opt} onClick={() => setQNeat(opt)} className={`w-full text-left p-3.5 rounded-xl border transition ${qNeat === opt ? "border-emerald-500 bg-emerald-500/5 text-white" : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"}`}>
                    <div className="font-semibold text-sm">{opt.replace("-", " ")}</div>
                    <div className="text-xs mt-0.5">{opt === "sedentary" ? "Desk job" : opt === "lightly-active" ? "On your feet" : "Physically demanding"}</div>
                  </button>
                ))}
                {/* Schedule Text */}
                <div className="mt-3">
                  <label className="block text-[11px] text-zinc-400 mb-1.5 font-medium">Describe weekly schedule</label>
                  <textarea value={qScheduleText} onChange={(e) => setQScheduleText(e.target.value)} placeholder="Type routine variables..." className="w-full h-16 p-3 rounded-xl border border-white/10 bg-black/40 text-white outline-none focus:border-emerald-500/40 text-xs resize-none" />
                </div>
              </div>
            )}
            {wizardStep === 4 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white mb-2">Training frequency:</h3>
                {["0 days", "1-2 days", "3-4 days", "5+ days"].map((opt) => (
                  <button key={opt} onClick={() => setQTrainingDays(opt)} className={`w-full text-left p-4 rounded-xl border transition ${qTrainingDays === opt ? "border-emerald-500 bg-emerald-500/5 text-white" : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"}`}>
                    <div className="font-semibold text-sm">{opt}</div>
                  </button>
                ))}
              </div>
            )}
            {wizardStep === 5 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white mb-2">Current body fat range:</h3>
                {["10-15%", "15-20%", "20-25%", "30%+"].map((opt) => (
                  <button key={opt} onClick={() => setQComposition(opt)} className={`w-full text-left p-4 rounded-xl border transition ${qComposition === opt ? "border-emerald-500 bg-emerald-500/5 text-white" : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"}`}>
                    <div className="font-semibold text-sm">{opt}</div>
                  </button>
                ))}
              </div>
            )}
            {wizardStep === 6 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Target weight (kg):</h3>
                <input type="number" value={qTargetWeight} onChange={(e) => setQTargetWeight(e.target.value)} placeholder="Optional" className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white outline-none focus:border-emerald-500/40 text-sm font-num" />
              </div>
            )}
            {wizardStep === 7 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white mb-2">Eating style:</h3>
                {["Omnivore", "High-protein", "Plant-based", "Low-carb", "Medical / allergies"].map((opt) => (
                  <button key={opt} onClick={() => setQDietStyle(opt.toLowerCase())} className={`w-full flex items-center justify-between p-4 rounded-xl border transition ${qDietStyle === opt.toLowerCase() ? "border-emerald-500 bg-emerald-500/5 text-white" : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"}`}>
                    <span className="font-semibold text-sm">{opt}</span>
                    {qDietStyle === opt.toLowerCase() && <Check className="h-4 w-4 text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}
            {wizardStep === 8 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white mb-2">Protein target:</h3>
                {["elite", "standard"].map((tier) => (
                  <button key={tier} onClick={() => setQProteinTier(tier)} className={`w-full text-left p-4 rounded-xl border transition ${qProteinTier === tier ? "border-emerald-500 bg-emerald-500/5 text-white" : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"}`}>
                    <div className="font-semibold text-sm">{tier === "elite" ? "Elite recomp" : "Standard"}</div>
                    <div className="text-xs mt-0.5">{tier === "elite" ? "2.2g/kg" : "1.6g/kg"}</div>
                  </button>
                ))}
              </div>
            )}
            {wizardStep === 9 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Daily steps:</h3>
                <input type="number" value={qStepTarget} onChange={(e) => setQStepTarget(e.target.value)} placeholder="e.g. 7500" className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white outline-none focus:border-emerald-500/40 text-sm font-num" />
                <p className="text-[10px] text-zinc-600 mt-1">Use realistic ranges like under 5k, 5k-10k, etc.</p>
              </div>
            )}
            {wizardStep === 10 && (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                <h3 className="text-sm font-bold text-white mb-2">What gets in the way?</h3>
                {["forgetting", "portion", "cravings", "time-limits"].map((obst) => (
                  <button key={obst} onClick={() => setQAdherenceObstacle(obst)} className={`w-full text-left p-3.5 rounded-xl border transition ${qAdherenceObstacle === obst ? "border-emerald-500 bg-emerald-500/5 text-white" : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"}`}>
                    <div className="font-semibold text-sm">{obst.replace("-", " ")}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Navigation buttons */}
          <div className="flex justify-between items-center border-t border-white/5 pt-4">
            <button disabled={wizardStep === 1} onClick={() => setWizardStep(prev => prev - 1)} className="text-xs font-semibold text-zinc-400 hover:text-white transition disabled:opacity-20">← Back</button>
            {wizardStep < 10 ? (
              <button onClick={() => setWizardStep(prev => prev + 1)} className="h-10 px-5 rounded-xl bg-emerald-400 text-black text-xs font-bold transition hover:bg-emerald-300 flex items-center gap-1"><span>Next</span> →</button>
            ) : (
              <button onClick={() => { setShowBaselineWizard(false); }} className="h-10 px-6 rounded-xl bg-white text-black text-xs font-bold transition hover:bg-zinc-200">Save Baseline Targets</button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Main UI
  return (
    <main className="min-h-screen bg-[#050507] text-[#E4E4E7] font-sans relative px-4 pb-36 pt-7 overflow-x-hidden">
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

        {error && (
          <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-xs text-red-300 backdrop-blur-md">
            <span className="font-semibold text-red-400 block mb-0.5">Network Error</span>
            {error}
          </div>
        )}

        {/* Today Tab */}
        {activeTab === "today" && (
          <div className="space-y-4">
            {/* Metric Header */}
            <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-2xl">
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
            <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl">
              <h3 className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium mb-4">MACRO NUTRIENT SUB-SYSTEMS</h3>
              {[
                { label: "Protein", value: metrics.protein, target: 150, color: "#10B981" },
                { label: "Carbohydrates", value: metrics.carbs, target: 220, color: "#3B82F6" },
                { label: "Fat", value: metrics.fat, target: 70, color: "#F59E0B" },
              ].map(({ label, value, target, color }) => (
                <div key={label} className="mb-3">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-zinc-400">{label} Component</span>
                    <span className="font-num text-white font-medium">{Math.round(value)}g <span className="text-zinc-600">/ {target}g</span></span>
                  </div>
                  <div className="h-1.5 w-full bg-white/[0.03] border border-white/5 rounded-full overflow-hidden">
                    <div style={{ width: `${Math.min((value / target) * 100, 100)}%`, backgroundColor: color }} className="h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,0,0,0.2)]" />
                  </div>
                </div>
              ))}
            </div>
            {/* Trend Chart */}
            <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-1 shadow-xl">
              <TrendChart days={dashboard?.days ?? []} velocity={dashboard?.weekly_weight_velocity ?? null} />
            </div>
            {/* Weight Log */}
            <section className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl hover:border-white/15 transition">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="mb-0.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">WEIGHT SIGNAL</p>
                  <h2 className="text-base font-bold text-white font-heading tracking-tight">7-day trend</h2>
                </div>
                <div className="h-8 w-8 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-center text-zinc-500"><CalendarDays className="h-4 w-4" /></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300"><Scale className="h-4 w-4" /></div>
                <input
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void saveWeight(); }}
                  placeholder="Log weight in kg..."
                  className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 text-sm text-white font-num outline-none focus:border-emerald-500/40 focus:bg-black/60 transition"
                />
                <button onClick={() => void saveWeight()} disabled={weightSaving || !weight} className="h-10 px-4 rounded-xl bg-white text-xs font-bold text-black transition hover:bg-zinc-200 active:scale-95 shadow-md">{weightSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</button>
              </div>
            </section>
            {/* Adaptive Targets */}
            <section className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl transition hover:border-white/15">
              <div className="flex items-center gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"><Activity className="h-4 w-4" /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-white font-heading">Adaptive Targets</p>
                    <span className="text-[9px] font-num font-bold px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.2)]">ON TRACK</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">{adaptiveMessage || "Recalculates targets dynamically."}</p>
                </div>
                <button onClick={() => void runAdaptive()} disabled={adaptiveBusy} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.02] text-zinc-400 transition hover:border-white/20 hover:text-white active:scale-95 disabled:opacity-30">{adaptiveBusy ? <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> : <RefreshCw className="h-4 w-4" />}</button>
              </div>
            </section>
            {/* Log Summary */}
            {parsedLog && (
              <section className="bg-emerald-950/20 border border-emerald-500/20 rounded-[24px] p-5 shadow-xl backdrop-blur-md animate-fade-in">
                <div className="flex items-start gap-3.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-400 text-black shadow-lg shadow-emerald-400/20"><Check className="h-4 w-4 stroke-[2.5]" /></div>
                  <div>
                    <p className="text-sm font-bold text-emerald-300 font-heading">{parsedLog.category === "NUTRITION" ? "Nutrition Log" : "Athletic Metric"} Compiled</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-300">{parsedLog.raw_summary}</p>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Trends Tab */}
        {activeTab === "trends" && (
          <div className="space-y-4">
            <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-1 shadow-xl">
              <TrendChart days={dashboard?.days ?? []} velocity={dashboard?.weekly_weight_velocity ?? null} />
            </div>
            {/* Window Totals */}
            <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl">
              <p className="mb-4 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">WINDOW TOTALS</p>
              <div className="grid grid-cols-2 gap-4">
                {[{ label: "Calories Logged", value: dashboard?.total_calorie_intake, icon: <Utensils /> }, { label: "Active Burn", value: dashboard?.total_active_calories_burned, icon: <Activity /> }].map((item) => (
                  <div key={item.label} className="rounded-xl bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-20">{item.icon}</div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">{item.label}</p>
                    <p className="font-num text-2xl font-bold text-white">{Math.round(item.value ?? 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <section className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 shadow-xl">
              <p className="mb-1 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">PROFILE</p>
              <h2 className="text-lg font-bold text-white font-heading">Your targets</h2>
              <div className="mt-5 space-y-3.5 text-sm">
                <div className="flex justify-between border-b border-white/5 pb-3 text-zinc-400"><span>Daily calories</span><span className="font-num text-white font-semibold">{dynamicTargets.calories} kcal</span></div>
                <div className="flex justify-between border-b border-white/5 pb-3 text-zinc-400"><span>Active burn</span><span className="font-num text-white font-semibold">{dynamicTargets.active} kcal</span></div>
                <div className="flex justify-between border-b border-white/5 pb-3 text-zinc-400"><span>Logged weight days</span><span className="font-num text-emerald-400 font-semibold">{dashboard?.weight_days_logged ?? 0} / 7</span></div>
              </div>
              {/* Edit button */}
              <button onClick={() => { setWizardStep(1); setShowBaselineWizard(true); }} className="mt-5 flex w-full items-center justify-center gap-2 h-10 border border-white/10 bg-white/[0.02] rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.05] shadow-md">
                <Plus className="h-4 w-4 text-emerald-400" /> <span>Edit your baseline variables</span>
              </button>
            </section>
            {/* Refresh button */}
            <button onClick={() => void refresh()} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#121215]/80 backdrop-blur-xl px-5 py-4 text-sm font-medium text-zinc-300 shadow-lg hover:border-white/20 transition active:scale-98">
              <span className="flex items-center gap-3"><Settings2 className="h-4 w-4 text-emerald-400" /> Sync with backend</span>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> : <ChevronRight className="h-4 w-4 text-zinc-600" />}
            </button>
          </div>
        )}

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-white/10 bg-[#050507]/90 px-8 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 backdrop-blur-2xl shadow-[0_-10px_35px_rgba(0,0,0,0.8)]">
          {["today", "trends", "profile"].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex flex-col items-center gap-1.5 text-[10px] font-medium uppercase transition-colors ${activeTab === tab ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}>
              {tab === "today" ? <CalendarDays className="h-4.5 w-4.5" /> : tab === "trends" ? <Activity className="h-4.5 w-4.5" /> : <CircleUserRound className="h-4.5 w-4.5" />}
              <span>{tab}</span>
            </button>
          ))}
        </nav>

        {/* Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-[#050507]/90 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#121215]/90 px-4 py-3.5 text-xs font-medium text-zinc-300 shadow-2xl">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" /> <span>Loading dashboard...</span>
            </div>
          </div>
        )}

        {/* Food Log Bar */}
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-30">
          <QuickLogBar onParsed={setParsedLog} />
        </div>
      </div>
    </main>
  );
}
