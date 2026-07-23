export type SupabaseProject = {
  id: string;
  name: string;
  project_url: string;
  active: boolean;
  description: string | null;
  last_test_at: string | null;
  last_test_status: "ok" | "invalid_key" | "unreachable" | "unknown" | null;
  created_at: string;
  updated_at: string;
};
