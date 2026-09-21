export type EntryType = "NUTRITION" | "ATHLETIC";
export type Category = EntryType;

export type ParsedItem = {
  name?: string;
  quantity?: number;
  unit?: string;
  estimated_calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  exercise_name?: string;
  sets?: number | null;
  reps?: number | null;
  weight_kg?: number | null;
};

export type CombinedParseResult = {
  category: Category;
  items: ParsedItem[];
  raw_summary: string;
};

export type LoggedItem = {
  id: number;
  entry_type: EntryType;
  raw_text: string;
  structured_json: Record<string, unknown>;
  created_at: string | null;
};

export type DashboardDay = {
  date: string;
  metric_weight: number | null;
  calorie_intake: number;
  active_calories_burned: number;
  logged_items: LoggedItem[];
};

export type DashboardResponse = {
  user_id: number;
  start_date: string;
  end_date: string;
  weight_days_logged: number;
  rolling_average_weight: number | null;
  weekly_weight_velocity: number | null;
  total_calorie_intake: number;
  total_active_calories_burned: number;
  days: DashboardDay[];
};

export type WeightLogRequest = {
  user_id: number;
  date: string;
  metric_weight: number;
};

export type WeightLogResponse = WeightLogRequest & {
  id: number;
  created_at: string;
};

export type AdaptiveAuditResponse = {
  audit: {
    adjustment_applied: boolean;
    proposed_calorie_target: number | null;
    proposed_active_calorie_target: number | null;
    calorie_target_shift: number;
    tdee_estimate: number | null;
    weekly_weight_velocity: number | null;
    reason: string;
    [key: string]: unknown;
  };
  updated_profile: {
    id: number;
    current_target_calories: number | null;
    current_target_active_calories: number | null;
    target_velocity: number | null;
  };
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function parseLog(rawText: string, categoryHint?: Category) {
  return request<CombinedParseResult>("/api/v1/parse-log", {
    method: "POST",
    body: JSON.stringify({ raw_text: rawText, category_hint: categoryHint }),
  });
}

export function logWeight(payload: WeightLogRequest) {
  return request<WeightLogResponse>("/api/v1/logs/weight", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getDashboard(userId: number) {
  return request<DashboardResponse>(`/api/v1/logs/dashboard/${userId}`);
}

export function recalculateAdaptiveTargets(userId: number) {
  return request<AdaptiveAuditResponse>(`/api/v1/adaptive/recalculate/${userId}`, {
    method: "POST",
  });
}
