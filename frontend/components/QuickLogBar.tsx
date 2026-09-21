"use client";

import { useState } from "react";
import { ArrowUp, Check, Loader2, Mic, Sparkles } from "lucide-react";
import type { Category, CombinedParseResult } from "@/lib/api";
import { parseLog } from "@/lib/api";

type QuickLogBarProps = { onParsed: (result: CombinedParseResult) => void };

export function QuickLogBar({ onParsed }: QuickLogBarProps) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function submit() {
    const text = value.trim();
    if (!text || status === "loading") return;
    setStatus("loading"); setError("");
    try {
      const hint: Category | undefined = /workout|ran|run|lift|squat|press|set|reps/i.test(text) ? "ATHLETIC" : undefined;
      const result = await parseLog(text, hint);
      onParsed(result); setValue(""); setStatus("success");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not parse this log"); setStatus("error");
    }
  }

  return <div className="fixed inset-x-0 bottom-4 z-20 mx-auto w-[calc(100%-2rem)] max-w-md"><div className="rounded-[24px] border border-white/[0.09] bg-[#151515]/95 p-2 shadow-[0_14px_45px_rgba(0,0,0,0.55)] backdrop-blur-xl"><div className="flex items-center gap-2"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-lime-300/10 text-lime-300"><Sparkles className="h-4 w-4" /></div><input value={value} onChange={(event) => { setValue(event.target.value); if (status === "error") setStatus("idle"); }} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} placeholder="Log food or movement..." aria-label="Describe food or workout" className="min-w-0 flex-1 bg-transparent px-1 text-sm text-white outline-none placeholder:text-zinc-600" /><button type="button" aria-label="Voice input" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"><Mic className="h-4 w-4" /></button><button type="button" onClick={() => void submit()} disabled={!value.trim() || status === "loading"} aria-label="Submit quick log" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lime-300 text-black transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-30">{status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : status === "success" ? <Check className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</button></div>{status === "error" && <p className="px-12 pt-1 text-[10px] text-red-300">{error}</p>}{status === "success" && <p className="px-12 pt-1 text-[10px] text-lime-300">Parsed and ready to review.</p>}</div></div>;
}
