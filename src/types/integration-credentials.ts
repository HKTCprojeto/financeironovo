export type IntegrationTestStatus = "ok" | "invalid" | "unreachable" | "unknown";

export type IntegrationCredentialMeta = {
  skill_name: string;
  active: boolean;
  last_test_at: string | null;
  last_test_status: IntegrationTestStatus | null;
  last_test_detail: string | null;
  updated_at: string;
};
