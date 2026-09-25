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
    Plus,
    X,
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

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function getDynamicDateString() {
    const current = new Date();
    const weekday = current.toLocaleDateString("en-US", { weekday: "long" });
    const month = current.toLocaleDateString("en-US", { month: "long" });
    const day = current.getDate();

    return `${weekday} · ${month} ${day}`;
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

    const [showBaselineWizard, setShowBaselineWizard] = useState(true);
    const [wizardStep, setWizardStep] = useState(1);

    const [qFocus, setQFocus] = useState("recomp");
    const [qCurrentWeight, setQCurrentWeight] = useState("75");
    const [qHeight, setQHeight] = useState("178");
    const [qAge, setQAge] = useState("25");
    const [qGender, setQGender] = useState("male");
    const [qNeat, setQNeat] = useState("lightly-active");
    const [qScheduleText, setQScheduleText] = useState("");
    const [qTrainingDays, setQTrainingDays] = useState("3-4");
    const [qComposition, setQComposition] = useState("15-20");
    const [qTargetWeight, setQTargetWeight] = useState("");
    const [qDietStyle, setQDietStyle] = useState("omnivore");
    const [qProteinTier, setQProteinTier] = useState("elite");
    const [qStepTarget, setQStepTarget] = useState("7500");
    const [qAdherenceObstacle, setQAdherenceObstacle] = useState("time-limits");

    const dynamicTargets = useMemo(() => {
        const w = Number(qCurrentWeight) || 70;
        const h = Number(qHeight) || 175;
        const a = Number(qAge) || 25;

        let baseBmr = 10 * w + 6.25 * h - 5 * a;
        baseBmr = qGender === "male" ? baseBmr + 5 : baseBmr - 161;

        let activityMultiplier = 1.2;
        if (qNeat === "lightly-active") activityMultiplier = 1.375;
        if (qNeat === "highly-active") activityMultiplier = 1.55;

        let calculatedCalories = Math.round(baseBmr * activityMultiplier);
        if (qFocus === "fat-loss") calculatedCalories -= 400;
        if (qFocus === "hypertrophy") calculatedCalories += 300;

        return { calories: Math.max(calculatedCalories, 1200) };
    }, [qFocus, qCurrentWeight, qHeight, qAge, qGender, qNeat]);

    const refresh = useCallback(async (silent = false) => {
        if (!silent) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

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

    const handleLogParsed = useCallback(
        (result: CombinedParseResult) => {
            setParsedLog(result);
            void refresh(true);
        },
        [refresh],
    );

    const metrics = useMemo(() => {
        const days = dashboard?.days ?? [];
        let calories = 0;
        let protein = 0;
        let carbs = 0;
        let fat = 0;

        for (const day of days) {
            for (const item of day.logged_items) {
                const payload = item.structured_json;
                const items = Array.isArray(payload.items) ? payload.items : [payload];

                for (const parsed of items) {
                    if (!parsed || typeof parsed !== "object") continue;

                    const value = parsed as Record<string, unknown>;

                    if (item.entry_type === "NUTRITION") {
                        calories += Number(value.estimated_calories ?? value.calories ?? 0);
                        protein += Number(value.protein_g ?? value.protein ?? 0);
                        carbs += Number(value.carbs_g ?? value.carbs ?? 0);
                        fat += Number(value.fat_g ?? value.fat ?? 0);
                    }
                }
            }
        }

        return { calories, protein, carbs, fat };
    }, [dashboard]);

    async function saveWeight() {
        const parsed = Number(weight);
        if (!Number.isFinite(parsed) || parsed <= 0) return;

        setWeightSaving(true);

        try {
            await logWeight({
                user_id: USER_ID,
                date: todayIso(),
                metric_weight: parsed,
            });
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

    if (showBaselineWizard) {
        return (
            <main className="min-h-screen bg-[#050507] text-[#E4E4E7] font-sans flex flex-col items-center justify-start px-4 py-8 overflow-y-auto animate-in fade-in duration-500">
                <div className="w-full max-w-xl bg-[#121215]/90 border border-white/10 rounded-[24px] p-6 shadow-2xl backdrop-blur-2xl mt-4 transition-all duration-300">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <p className="text-[10px] tracking-wider uppercase text-emerald-400 font-bold font-num">
                                ONBOARDING CONFIGURATION
                            </p>
                            <h2 className="text-2xl font-bold font-heading text-white tracking-tight mt-1">
                                Setup baseline targets
                            </h2>
                        </div>

                        <button
                            onClick={() => setShowBaselineWizard(false)}
                            className="p-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-zinc-400 hover:text-white transition"
                            aria-label="Close questionnaire"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-1 w-full my-5 overflow-x-auto pb-1 text-[9px] uppercase tracking-wider font-medium text-zinc-600 font-num">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((step) => (
                            <span
                                key={step}
                                className={`px-2 py-0.5 rounded transition ${
                                    wizardStep === step
                                        ? "text-emerald-400 border-b-2 border-emerald-400 font-bold"
                                        : ""
                                }`}
                            >
                                Q{step}
                            </span>
                        ))}
                    </div>

                    <div className="min-h-[260px] bg-white/[0.01] border border-white/5 rounded-2xl p-5 mb-6 transition-all duration-300">
                        <p className="text-xs text-zinc-500 mb-4 font-num">
                            Step {wizardStep} of 10
                        </p>

                        {wizardStep === 1 && (
                            <div className="space-y-2.5 animate-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-sm font-bold text-white mb-2">
                                    Select macro focal point:
                                </h3>
                                {["fat-loss", "recomp", "hypertrophy"].map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => setQFocus(opt)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                                            qFocus === opt
                                                ? "border-emerald-500 bg-emerald-500/5 text-white"
                                                : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"
                                        }`}
                                    >
                                        <div className="font-semibold text-sm capitalize text-white">
                                            {opt.replace("-", " ")}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {wizardStep === 2 && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-2 duration-300">
                                <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                                        Weight (kg)
                                    </label>
                                    <input
                                        type="number"
                                        value={qCurrentWeight}
                                        onChange={(e) => setQCurrentWeight(e.target.value)}
                                        className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white font-num"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                                        Height (cm)
                                    </label>
                                    <input
                                        type="number"
                                        value={qHeight}
                                        onChange={(e) => setQHeight(e.target.value)}
                                        className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white font-num"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                                        Age
                                    </label>
                                    <input
                                        type="number"
                                        value={qAge}
                                        onChange={(e) => setQAge(e.target.value)}
                                        className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white font-num"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] text-zinc-400 mb-1 font-medium">
                                        Gender
                                    </label>
                                    <select
                                        value={qGender}
                                        onChange={(e) => setQGender(e.target.value)}
                                        className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white"
                                    >
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {wizardStep === 3 && (
                            <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-sm font-bold text-white">
                                    Choose NEAT energy baseline:
                                </h3>
                                {["sedentary", "lightly-active", "highly-active"].map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => setQNeat(opt)}
                                        className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                                            qNeat === opt
                                                ? "border-emerald-500 bg-emerald-500/5 text-white"
                                                : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"
                                        }`}
                                    >
                                        <div className="font-semibold text-sm capitalize text-white">
                                            {opt.replace("-", " ")}
                                        </div>
                                    </button>
                                ))}
                                <textarea
                                    value={qScheduleText}
                                    onChange={(e) => setQScheduleText(e.target.value)}
                                    placeholder="Describe your daily schedule and routine for precise NEAT calibration..."
                                    className="w-full h-16 p-3 rounded-xl border border-white/10 bg-black/40 text-white outline-none focus:border-emerald-500/40 text-xs resize-none"
                                />
                            </div>
                        )}

                        {wizardStep === 4 && (
                            <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-sm font-bold text-white mb-2">
                                    Weekly training frequency:
                                </h3>
                                {["0 days", "1-2 days", "3-4 days", "5+ days"].map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => setQTrainingDays(opt)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                                            qTrainingDays === opt
                                                ? "border-emerald-500 bg-emerald-500/5 text-white"
                                                : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"
                                        }`}
                                    >
                                        <div className="font-semibold text-sm text-white">{opt}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {wizardStep === 5 && (
                            <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-sm font-bold text-white mb-2">
                                    Estimated body fat parameters:
                                </h3>
                                {["10-15%", "15-20%", "20-25%", "30%+"].map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => setQComposition(opt)}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                                            qComposition === opt
                                                ? "border-emerald-500 bg-emerald-500/5 text-white"
                                                : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"
                                        }`}
                                    >
                                        <div className="font-semibold text-sm text-white">{opt}</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {wizardStep === 6 && (
                            <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-sm font-bold text-white">
                                    Target destination weight (kg)
                                </h3>
                                <input
                                    type="number"
                                    value={qTargetWeight}
                                    onChange={(e) => setQTargetWeight(e.target.value)}
                                    placeholder="Optional"
                                    className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white font-num"
                                />
                            </div>
                        )}

                        {wizardStep === 7 && (
                            <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-sm font-bold text-white mb-2">
                                    Select specific diet framework:
                                </h3>
                                {["Omnivore", "High-protein", "Plant-based", "Low-carb"].map(
                                    (opt) => (
                                        <button
                                            key={opt}
                                            onClick={() => setQDietStyle(opt.toLowerCase())}
                                            className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                                                qDietStyle === opt.toLowerCase()
                                                    ? "border-emerald-500 bg-emerald-500/5 text-white"
                                                    : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"
                                            }`}
                                        >
                                            <span className="font-semibold text-sm text-white">
                                                {opt}
                                            </span>
                                            {qDietStyle === opt.toLowerCase() && (
                                                <Check className="h-4 w-4 text-emerald-400" />
                                            )}
                                        </button>
                                    ),
                                )}
                            </div>
                        )}

                        {wizardStep === 8 && (
                            <div className="space-y-2.5 animate-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-sm font-bold text-white mb-2">
                                    Protein scaling constraints:
                                </h3>
                                <button
                                    onClick={() => setQProteinTier("elite")}
                                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                                        qProteinTier === "elite"
                                            ? "border-emerald-500 bg-emerald-500/5 text-white"
                                            : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"
                                    }`}
                                >
                                    <div className="font-semibold text-sm text-white">
                                        Elite allocation (2.2g/kg)
                                    </div>
                                </button>
                                <button
                                    onClick={() => setQProteinTier("standard")}
                                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                                        qProteinTier === "standard"
                                            ? "border-emerald-500 bg-emerald-500/5 text-white"
                                            : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"
                                    }`}
                                >
                                    <div className="font-semibold text-sm text-white">
                                        Standard structural (1.6g/kg)
                                    </div>
                                </button>
                            </div>
                        )}

                        {wizardStep === 9 && (
                            <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-sm font-bold text-white">
                                    Averaged daily foot steps
                                </h3>
                                <input
                                    type="number"
                                    value={qStepTarget}
                                    onChange={(e) => setQStepTarget(e.target.value)}
                                    className="w-full h-11 px-3.5 rounded-xl border border-white/10 bg-black/40 text-white font-num"
                                />
                            </div>
                        )}

                        {wizardStep === 10 && (
                            <div className="space-y-2 animate-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-sm font-bold text-white mb-2">
                                    Primary logging obstacle point:
                                </h3>
                                {["forgetting", "portion-estimation", "time-limits"].map((opt) => (
                                    <button
                                        key={opt}
                                        onClick={() => setQAdherenceObstacle(opt)}
                                        className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                                            qAdherenceObstacle === opt
                                                ? "border-emerald-500 bg-emerald-500/5 text-white"
                                                : "border-white/5 bg-black/20 text-zinc-400 hover:border-white/10"
                                        }`}
                                    >
                                        <div className="font-semibold text-sm capitalize text-white">
                                            {opt.replace("-", " ")}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center border-t border-white/5 pt-4">
                        <button
                            disabled={wizardStep === 1}
                            onClick={() => setWizardStep((prev) => prev - 1)}
                            className="text-xs font-semibold text-zinc-400 hover:text-white transition disabled:opacity-20"
                        >
                            ← Back
                        </button>

                        {wizardStep < 10 ? (
                            <button
                                onClick={() => setWizardStep((prev) => prev + 1)}
                                className="h-10 px-5 rounded-xl bg-emerald-400 text-black text-xs font-bold transition hover:bg-emerald-300 flex items-center gap-1"
                            >
                                <span>Next</span> →
                            </button>
                        ) : (
                            <button
                                onClick={() => setShowBaselineWizard(false)}
                                className="h-10 px-6 rounded-xl bg-white text-black text-xs font-bold transition hover:bg-zinc-200 shadow-lg shadow-white/5"
                            >
                                Save Core Targets
                            </button>
                        )}
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#050507] text-[#E4E4E7] font-sans relative px-4 pb-36 pt-7 overflow-x-hidden selection:bg-emerald-500/20 selection:text-emerald-200 transition-all duration-300">
            <div className="mx-auto max-w-md relative z-10 animate-in fade-in duration-500">
                <header className="mb-6 flex items-center justify-between">
                    <div>
                        <p className="mb-0.5 text-[10px] tracking-[0.2em] uppercase text-zinc-500 font-num font-medium">
                            {getDynamicDateString()}
                        </p>
                        <h1 className="text-3xl font-bold tracking-tight text-white font-heading">
                            Good to see you<span className="text-emerald-400">.</span>
                        </h1>
                    </div>

                    {activeTab !== "profile" ? (
                        <button
                            aria-label="Profile"
                            onClick={() => setActiveTab("profile")}
                            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-[#121215]/80 backdrop-blur-xl text-zinc-400 transition hover:border-white/20 hover:text-white active:scale-95 shadow-xl"
                        >
                            <CircleUserRound className="h-5 w-5" />
                        </button>
                    ) : (
                        <button
                            aria-label="Dashboard Back link"
                            onClick={() => setActiveTab("today")}
                            className="flex items-center gap-2 h-9 px-3 rounded-lg border border-white/10 bg-[#121215]/80 backdrop-blur-xl text-xs font-medium text-zinc-400 transition hover:border-white/20 hover:text-white active:scale-95 shadow-xl"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            <span>Dashboard</span>
                        </button>
                    )}
                </header>

                {error && (
                    <div className="mb-5 rounded-2xl border border-red-500/20 bg-red-950/20 px-4 py-3 text-xs text-red-300 backdrop-blur-md">
                        <span className="font-semibold text-red-400 block mb-0.5">
                            Network Connectivity Anomaly
                        </span>
                        {error}. Check configuration array metrics.
                    </div>
                )}

                {activeTab === "today" && (
                    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                        <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 shadow-2xl relative transition-all duration-300 transform scale-[1.02] border-emerald-500/20 shadow-emerald-500/[0.02]">
                            <MetricHeader
                                targetCalories={dynamicTargets.calories}
                                consumedCalories={metrics.calories}
                                targetActiveCalories={0}
                                activeCalories={0}
                                proteinGrams={metrics.protein}
                                proteinTarget={150}
                                carbsGrams={metrics.carbs}
                                carbsTarget={220}
                                fatGrams={metrics.fat}
                                fatTarget={70}
                            />
                        </div>

                        <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl transition-all duration-300 hover:border-white/15">
                            <h3 className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium mb-3.5 font-num">
                                MACRO NUTRIENT TARGET STATUS
                            </h3>

                            <div className="space-y-3.5">
                                <div>
                                    <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-zinc-400">Protein Component</span>
                                        <span className="font-num text-white font-medium">
                                            {Math.round(metrics.protein)}g{" "}
                                            <span className="text-zinc-600">/ 150g</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/[0.02] border border-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-[#10B981] rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                                            style={{
                                                width: `${Math.min((metrics.protein / 150) * 100, 100)}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-zinc-400">Carbohydrate Payload</span>
                                        <span className="font-num text-white font-medium">
                                            {Math.round(metrics.carbs)}g{" "}
                                            <span className="text-zinc-600">/ 220g</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/[0.02] border border-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-[#3B82F6] rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(59,130,246,0.4)]"
                                            style={{
                                                width: `${Math.min((metrics.carbs / 220) * 100, 100)}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center text-xs mb-1">
                                        <span className="text-zinc-400">Lipid Content (Fat)</span>
                                        <span className="font-num text-white font-medium">
                                            {Math.round(metrics.fat)}g{" "}
                                            <span className="text-zinc-600">/ 70g</span>
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full bg-white/[0.02] border border-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-[#F59E0B] rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                                            style={{
                                                width: `${Math.min((metrics.fat / 70) * 100, 100)}%`,
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-2 shadow-xl hover:border-white/15 transition-all">
                            <TrendChart
                                days={dashboard?.days ?? []}
                                velocity={dashboard?.weekly_weight_velocity ?? null}
                            />
                        </div>

                        <section className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl hover:border-white/15 transition-all duration-300">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <p className="mb-0.5 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">
                                        METRIC SIGNAL
                                    </p>
                                    <h2 className="text-base font-bold text-white font-heading tracking-tight">
                                        Mass Check-In
                                    </h2>
                                </div>
                                <div className="h-8 w-8 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-center text-zinc-500">
                                    <CalendarDays className="h-4 w-4" />
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-300">
                                    <Scale className="h-4 w-4" />
                                </div>
                                <input
                                    inputMode="decimal"
                                    value={weight}
                                    onChange={(event) => setWeight(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") void saveWeight();
                                    }}
                                    placeholder="Log weight in kg..."
                                    className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3.5 text-sm text-white font-num outline-none focus:border-emerald-500/40 focus:bg-black/60 transition-all duration-300"
                                />
                                <button
                                    onClick={() => void saveWeight()}
                                    disabled={weightSaving || !weight}
                                    className="h-10 px-4 rounded-xl bg-white text-xs font-bold text-black transition-all hover:bg-zinc-200 active:scale-95 disabled:opacity-20 shadow-md"
                                >
                                    {weightSaving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        "Save"
                                    )}
                                </button>
                            </div>
                        </section>

                        <section className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl hover:border-white/15 transition-all duration-300">
                            <div className="flex items-center gap-4">
                                <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                    <Activity className="h-4 w-4" />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-bold text-white font-heading tracking-tight">
                                            Adaptive Targets
                                        </p>
                                        <span className="text-[9px] font-num font-bold px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                                            ACTIVE
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-zinc-500">
                                        {adaptiveMessage ||
                                            "Adjusts calorie allocations based on target compliance loops."}
                                    </p>
                                </div>

                                <button
                                    onClick={() => void runAdaptive()}
                                    disabled={adaptiveBusy}
                                    aria-label="Recalculate adaptive values"
                                    className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.02] text-zinc-400 transition-all hover:border-white/20 hover:text-white active:scale-95 disabled:opacity-30"
                                >
                                    {adaptiveBusy ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4" />
                                    )}
                                </button>
                            </div>

                            {parsedLog && (
                                <p className="mt-3 border-t border-white/5 pt-3 text-xs text-zinc-400">
                                    <span className="font-semibold text-emerald-400">
                                        {parsedLog.category === "NUTRITION"
                                            ? "Nutrition Log"
                                            : "Athletic Metric"}{" "}
                                        Compiled
                                    </span>
                                    {parsedLog.raw_summary && (
                                        <span className="ml-1">{parsedLog.raw_summary}</span>
                                    )}
                                </p>
                            )}
                        </section>
                    </div>
                )}
                              {activeTab === "trends" && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-2 shadow-xl">
                            <TrendChart
                                days={dashboard?.days ?? []}
                                velocity={dashboard?.weekly_weight_velocity ?? null}
                            />
                        </div>

                        <div className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-5 shadow-xl">
                            <p className="mb-4 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium font-num">
                                ACCUMULATED RECORD WINDOWS
                            </p>
                            <div className="w-full">
                                <div className="rounded-xl bg-white/[0.01] border border-white/5 p-4 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-3 opacity-20 text-emerald-400">
                                        <Utensils className="h-4 w-4" />
                                    </div>
                                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mb-1">
                                        Total Caloric Intake Balance
                                    </p>
                                    <p className="font-num text-3xl font-bold text-white tracking-tight">
                                        {Math.round(dashboard?.total_calorie_intake ?? 0)}{" "}
                                        <span className="text-xs text-zinc-500 font-sans font-normal">
                                            kcal
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "profile" && (
                    <div className="space-y-4 animate-in fade-in duration-300">
                        <section className="bg-[#121215]/80 backdrop-blur-xl border border-white/10 rounded-[24px] p-6 shadow-xl">
                            <p className="mb-1 text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">
                                PROFILE CONFIGS
                            </p>
                            <h2 className="text-lg font-bold text-white font-heading tracking-tight">
                                Macro Matrix Targets
                            </h2>

                            <div className="mt-5 space-y-3.5 text-sm">
                                <div className="flex justify-between border-b border-white/5 pb-3 text-zinc-400">
                                    <span className="font-medium">Basal Target Matrix</span>
                                    <span className="font-num text-white font-semibold">
                                        {dynamicTargets.calories} kcal
                                    </span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-3 text-zinc-400">
                                    <span className="font-medium">Logged weight history</span>
                                    <span className="font-num text-emerald-400 font-semibold">
                                        {dashboard?.weight_days_logged ?? 0} / 7 Days
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    setWizardStep(1);
                                    setShowBaselineWizard(true);
                                }}
                                className="mt-5 flex w-full items-center justify-center gap-2 h-10 border border-white/10 bg-white/[0.02] rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-all shadow-md"
                            >
                                <Plus className="h-4 w-4 text-emerald-400" />
                                <span>Adjust questionnaire variables</span>
                            </button>
                        </section>

                        <button
                            onClick={() => void refresh()}
                            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#121215]/80 backdrop-blur-xl px-5 py-4 text-sm font-medium text-zinc-300 shadow-lg hover:border-white/20 transition-all duration-300 active:scale-98"
                        >
                            <span className="flex items-center gap-3 text-zinc-300">
                                <Settings2 className="h-4 w-4 text-emerald-400" />
                                Force sync database streams
                            </span>
                            {refreshing ? (
                                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                            ) : (
                                <ChevronRight className="h-4 w-4 text-zinc-600" />
                            )}
                        </button>
                    </div>
                )}

                <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 justify-around border-t border-white/10 bg-[#050507]/95 px-8 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 backdrop-blur-2xl shadow-[0_-10px_35px_rgba(0,0,0,0.9)]">
                    <button
                        onClick={() => setActiveTab("today")}
                        className={`flex flex-col items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase transition-colors duration-300 ${
                            activeTab === "today"
                                ? "text-emerald-400"
                                : "text-zinc-500 hover:text-zinc-300"
                        }`}
                    >
                        <CalendarDays className="h-4.5 w-4.5" />
                        <span>Today</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("trends")}
                        className={`flex flex-col items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase transition-colors duration-300 ${
                            activeTab === "trends"
                                ? "text-emerald-400"
                                : "text-zinc-500 hover:text-zinc-300"
                        }`}
                    >
                        <Activity className="h-4.5 w-4.5" />
                        <span>Trends</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("profile")}
                        className={`flex flex-col items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase transition-colors duration-300 ${
                            activeTab === "profile"
                                ? "text-emerald-400"
                                : "text-zinc-500 hover:text-zinc-300"
                        }`}
                    >
                        <CircleUserRound className="h-4.5 w-4.5" />
                        <span>Profile</span>
                    </button>
                </nav>

                {loading && (
                    <div className="fixed inset-0 z-50 grid place-items-center bg-[#050507]/90 backdrop-blur-md transition-all duration-300">
                        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#121215]/90 px-4 py-3.5 text-xs font-medium text-zinc-300 shadow-2xl">
                            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                            <span>Loading metric workspace...</span>
                        </div>
                    </div>
                )}

                <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-30 transition-transform duration-300 active:scale-[0.99]">
                    <QuickLogBar onParsed={handleLogParsed} />
                </div>
            </div>
        </main>
    );
}
