"use client";

import { ArrowDown, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardDay } from "@/lib/api";

type TrendChartProps = { days: DashboardDay[]; velocity: number | null };

export function TrendChart({ days, velocity }: TrendChartProps) {
  const data = days.map((day) => ({
    ...day,
    label: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${day.date}T12:00:00`)),
  }));
  const weights = data.map((day) => day.metric_weight).filter((value): value is number => value !== null);
  const latest = weights.at(-1);
  const first = weights.at(0);
  const direction = velocity === null ? "No trend" : velocity < 0 ? "Moving down" : velocity > 0 ? "Moving up" : "Holding steady";
  const DirectionIcon = velocity === null || velocity === 0 ? Minus : velocity < 0 ? TrendingDown : TrendingUp;

  return (
    <section className="glass-card p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">SIGNAL - Weight trend</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">Weight trend</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${velocity !== null && velocity <= 0 ? "bg-teal-300/10 text-teal-200" : "bg-orange-300/10 text-orange-200"}`}>
            <DirectionIcon className="h-3 w-3" />{direction}
          </div>
          <div className="flex gap-1 rounded-xl border border-white/[.06] bg-black/20 p-1">
            <button type="button" className="rounded-lg bg-white/[.08] px-2 py-1 text-[10px] text-white">7D</button>
            <button type="button" className="rounded-lg px-2 py-1 text-[10px] text-zinc-500">30D</button>
            <button type="button" className="rounded-lg px-2 py-1 text-[10px] text-zinc-500">ALL</button>
          </div>
        </div>
      </div>
      <div className="h-40 w-full">
        {weights.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 0, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#525252", fontSize: 10 }} />
              <YAxis hide domain={["dataMin - 0.4", "dataMax + 0.4"]} />
              <Tooltip contentStyle={{ background: "#1b1b1b", border: "1px solid #333", borderRadius: 12, fontSize: 11 }} labelStyle={{ color: "#a3a3a3" }} formatter={(value) => [`${Number(value).toFixed(1)} kg`, "Weight"]} />
              <Area type="monotone" dataKey="metric_weight" connectNulls stroke="#34d399" strokeWidth={2} fill="url(#weightFill)" dot={{ r: 2.5, fill: "#34d399", strokeWidth: 0 }} activeDot={{ r: 4, fill: "#fff", stroke: "#34d399", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/[0.08] text-xs text-zinc-600">Log weight for 5+ days to unlock the trend.</div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
        <ArrowDown className="h-3.5 w-3.5 text-teal-300" />
        {latest !== undefined ? <><span className="font-mono text-zinc-200">{latest.toFixed(1)} kg</span><span>latest</span>{first !== undefined && first !== latest && <><span className="text-zinc-700">·</span><span className="font-mono text-teal-200">{(latest - first).toFixed(1)} kg</span><span>this window</span></>}</> : <span>No weight data yet</span>}
      </div>
    </section>
  );
}
