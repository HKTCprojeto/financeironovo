import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ErpName = "omie" | "bling" | "contaazul" | "tiny" | "granatum" | "vhsys" | "nibo" | "holdprint";
export type CrmName = "hubspot" | "rdstation" | "piperun" | "pipedrive";
export type BillingName = "asaas" | "iugu";
export type EcommerceName = "mercado-livre" | "nuvemshop";

export type OnboardingData = {
  anthropic_key?: string;
  anthropic_validated?: boolean;
  whatsapp_phone?: string;
  erp?: { name: ErpName | "none"; credentials?: Record<string, string>; validated?: boolean };
  crm?: { name: CrmName | "none"; credentials?: Record<string, string>; validated?: boolean };
  billing?: { name: BillingName | "none"; credentials?: Record<string, string> };
  ecommerce?: { name: EcommerceName | "none" };
  installer_token?: string;
  installer_url?: string;
  vps_connected_instance_id?: string;
  whatsapp_paired?: boolean;
};

const LS_KEY = "agente_cfo_onboarding_v1";

export type OnboardingState = {
  current_step: number;
  data: OnboardingData;
  completed_at: string | null;
};

export function useOnboardingState() {
  const [state, setState] = useState<OnboardingState>({
    current_step: 1,
    data: {},
    completed_at: null,
  });
  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Hidrata do localStorage primeiro (instantâneo)
      const local = localStorage.getItem(LS_KEY);
      if (local) {
        try { setState((s) => ({ ...s, ...JSON.parse(local) })); } catch { /* ignore */ }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(true); return; }
      setUserId(user.id);

      const { data: row } = await supabase
        .from("user_onboarding")
        .select("current_step, data, completed_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (row) {
        const merged: OnboardingState = {
          current_step: row.current_step ?? 1,
          data: (row.data as OnboardingData) ?? {},
          completed_at: row.completed_at,
        };
        setState(merged);
        localStorage.setItem(LS_KEY, JSON.stringify(merged));
      }
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback(async (next: OnboardingState) => {
    setState(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    if (!userId) return;
    await supabase.from("user_onboarding").upsert({
      user_id: userId,
      current_step: next.current_step,
      data: next.data,
      completed_at: next.completed_at,
    }, { onConflict: "user_id" });
  }, [userId]);

  const updateData = useCallback((patch: Partial<OnboardingData>) => {
    setState((s) => {
      const next = { ...s, data: { ...s.data, ...patch } };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      if (userId) {
        supabase.from("user_onboarding").upsert({
          user_id: userId,
          current_step: next.current_step,
          data: next.data,
          completed_at: next.completed_at,
        }, { onConflict: "user_id" }).then(() => {});
      }
      return next;
    });
  }, [userId]);

  const goTo = useCallback((step: number) => {
    persist({ ...state, current_step: step });
  }, [persist, state]);

  const complete = useCallback(() => {
    persist({ ...state, completed_at: new Date().toISOString() });
  }, [persist, state]);

  return { state, loaded, userId, persist, updateData, goTo, complete };
}

export async function fetchOnboardingStatus(): Promise<{ completed: boolean; hasInstance: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { completed: false, hasInstance: false };
  const [{ data: onb }, { count }] = await Promise.all([
    supabase.from("user_onboarding").select("completed_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("instances").select("id", { count: "exact", head: true }),
  ]);
  return { completed: !!onb?.completed_at, hasInstance: (count ?? 0) > 0 };
}
