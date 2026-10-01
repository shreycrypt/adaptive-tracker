"use client";

import { Flame, Footprints, Target } from "lucide-react";

type MetricHeaderProps = {
  targetCalories: number;
  consumedCalories: number;
  targetActiveCalories: number;
  activeCalories: number;
  proteinGrams: number;
  proteinTarget: number;
  carbsGrams: number;
  carbsTarget: number;
  fatGrams: number;
  fatTarget: number;
};

function Ring({ value, color, children }: { value: number; color: string; children: React.ReactNode }) {
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(value, 0), 1);
  return (
    <div className="relative grid h-[74px] w-[74px] place-items-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#232323" strokeWidth="2" />
        <circle cx="32" cy="32" r={radius} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

function Macro({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const percentage = Math.min((value / Math.max(target, 1)) * 100, 100);
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
        <span>{label}</span><span className="font-mono text-zinc-300">{Math.round(value)}g</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: color }} /></div>
    </div>
  );
}

export function MetricHeader(props: MetricHeaderProps) {
  const calorieRatio = props.consumedCalories / Math.max(props.targetCalories, 1);
  const activeRatio = props.activeCalories / Math.max(props.targetActiveCalories, 1);
  return (
    <section className="rounded-[28px] border border-white/[0.07] bg-[#111111] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
      <div className="mb-5 flex items-center justify-between">
        <div><p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Daily balance</p><h2 className="text-lg font-semibold tracking-tight text-white">Fuel & movement</h2></div>
        <div className="rounded-full border border-lime-400/20 bg-lime-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-lime-300">On track</div>
      </div>
      <div className="flex items-center justify-around gap-4 border-b border-white/[0.06] pb-5">
        <Ring value={calorieRatio} color="#c7f36b"><div className="text-xl font-semibold tracking-tight text-white">{Math.round(props.consumedCalories)}</div><div className="text-[9px] uppercase tracking-widest text-zinc-500">of {Math.round(props.targetCalories)}</div></Ring>
        <div className="h-10 w-px bg-white/[0.08]" />
        <Ring value={activeRatio} color="#8ee7dd"><div className="text-xl font-semibold tracking-tight text-white">{Math.round(props.activeCalories)}</div><div className="text-[9px] uppercase tracking-widest text-zinc-500">burned</div></Ring>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400"><Target className="h-3.5 w-3.5 text-lime-300" /> Target <span className="font-mono text-zinc-200">{Math.round(props.targetCalories)} kcal</span><span className="text-zinc-700">·</span><Footprints className="h-3.5 w-3.5 text-teal-300" /> Active <span className="font-mono text-zinc-200">{Math.round(props.targetActiveCalories)} kcal</span><Flame className="ml-auto h-3.5 w-3.5 text-orange-300" /></div>
      <div className="mt-5 flex gap-4"><Macro label="Protein" value={props.proteinGrams} target={props.proteinTarget} color="#c7f36b" /><Macro label="Carbs" value={props.carbsGrams} target={props.carbsTarget} color="#8ee7dd" /><Macro label="Fat" value={props.fatGrams} target={props.fatTarget} color="#f6b46b" /></div>
    </section>
  );
}
