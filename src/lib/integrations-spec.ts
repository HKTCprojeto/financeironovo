export type IntegrationField = {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  required: boolean;
  help?: string;
  placeholder?: string;
};

export type IntegrationCategory =
  | "erp"
  | "crm"
  | "cobranca"
  | "ecommerce"
  | "database"
  | "marketing";

export type IntegrationSpec = {
  slug: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  auth_mode: "api_key" | "oauth";
  oauth_route?: string;
  fields?: IntegrationField[];
  doc_url?: string;
  /** Rota dedicada (ex: Supabase multi-projeto) */
  custom_route?: string;
};

export const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  erp: "ERP",
  crm: "CRM",
  cobranca: "Cobrança",
  ecommerce: "E-commerce",
  database: "Banco de dados",
  marketing: "Marketing",
};

export const INTEGRATIONS_SPEC: IntegrationSpec[] = [
  // ERP — API key
  {
    slug: "omie",
    name: "Omie",
    description: "ERP financeiro brasileiro — fluxo de caixa, NF-e, pedidos.",
    category: "erp",
    auth_mode: "api_key",
    fields: [
      { key: "OMIE_APP_KEY", label: "App Key", type: "password", required: true },
      { key: "OMIE_APP_SECRET", label: "App Secret", type: "password", required: true },
    ],
    doc_url: "https://developer.omie.com.br/",
  },
  {
    slug: "tiny",
    name: "Tiny ERP",
    description: "ERP focado em e-commerce.",
    category: "erp",
    auth_mode: "api_key",
    fields: [{ key: "TINY_TOKEN", label: "Token API", type: "password", required: true }],
    doc_url: "https://erp.tiny.com.br/configuracoes_api_web_services",
  },
  {
    slug: "granatum",
    name: "Granatum",
    description: "Gestão financeira para PMEs.",
    category: "erp",
    auth_mode: "api_key",
    fields: [{ key: "GRANATUM_API_KEY", label: "API Key", type: "password", required: true }],
    doc_url: "https://app.granatum.com.br/integracoes",
  },
  {
    slug: "vhsys",
    name: "VHSYS",
    description: "ERP modular online.",
    category: "erp",
    auth_mode: "api_key",
    fields: [
      { key: "VHSYS_ACCESS_TOKEN", label: "Access Token", type: "password", required: true },
      { key: "VHSYS_SECRET_TOKEN", label: "Secret Token", type: "password", required: true },
    ],
  },
  {
    slug: "nibo",
    name: "Nibo",
    description: "Contabilidade + contas a pagar/receber.",
    category: "erp",
    auth_mode: "api_key",
    fields: [{ key: "NIBO_API_TOKEN", label: "API Token", type: "password", required: true }],
  },
  // ERP — OAuth
  {
    slug: "bling",
    name: "Bling",
    description: "ERP + e-commerce — NF-e, pedidos, estoque.",
    category: "erp",
    auth_mode: "oauth",
    oauth_route: "/integrations/bling",
  },
  {
    slug: "contaazul",
    name: "ContaAzul",
    description: "Gestão financeira completa.",
    category: "erp",
    auth_mode: "oauth",
    oauth_route: "/integrations/contaazul",
  },

  // CRM
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "CRM + marketing — pipelines, contatos, deals.",
    category: "crm",
    auth_mode: "oauth",
    oauth_route: "/integrations/hubspot",
    doc_url: "https://developers.hubspot.com/docs/api/private-apps",
  },
  {
    slug: "rd-station",
    name: "RD Station CRM",
    description: "CRM brasileiro.",
    category: "crm",
    auth_mode: "api_key",
    fields: [{ key: "RD_STATION_API_KEY", label: "API Key", type: "password", required: true }],
    doc_url: "https://developers.rdstation.com/",
  },
  {
    slug: "piperun",
    name: "PipeRun",
    description: "CRM de vendas brasileiro.",
    category: "crm",
    auth_mode: "api_key",
    fields: [{ key: "PIPERUN_TOKEN", label: "Token", type: "password", required: true }],
    doc_url: "https://app.pipe.run/",
  },
  {
    slug: "pipedrive",
    name: "Pipedrive",
    description: "CRM internacional — pipeline e previsão.",
    category: "crm",
    auth_mode: "api_key",
    fields: [
      { key: "PIPEDRIVE_API_TOKEN", label: "API Token", type: "password", required: true },
      {
        key: "PIPEDRIVE_COMPANY_DOMAIN",
        label: "Subdomínio (ex: minhaempresa)",
        type: "text",
        required: true,
        placeholder: "minhaempresa",
      },
    ],
    doc_url: "https://pipedrive.readme.io/docs/how-to-find-the-api-token",
  },
  {
    slug: "kommo",
    name: "Kommo",
    description: "CRM (ex-amoCRM) — pipeline + chats + tasks.",
    category: "crm",
    auth_mode: "api_key",
    fields: [
      {
        key: "KOMMO_SUBDOMAIN",
        label: "Subdomínio (ex: empresa)",
        type: "text",
        required: true,
        placeholder: "empresa",
      },
      {
        key: "KOMMO_ACCESS_TOKEN",
        label: "Long-lived Access Token",
        type: "password",
        required: true,
      },
    ],
    doc_url: "https://www.kommo.com/developers/content/oauth/easy-auth/",
  },

  // Cobrança
  {
    slug: "asaas",
    name: "Asaas",
    description: "Boletos, PIX, cartão.",
    category: "cobranca",
    auth_mode: "api_key",
    fields: [
      { key: "ASAAS_API_KEY", label: "API Key", type: "password", required: true },
      {
        key: "ASAAS_ENV",
        label: "Ambiente",
        type: "text",
        required: true,
        placeholder: "production ou sandbox",
      },
    ],
  },
  {
    slug: "iugu",
    name: "Iugu",
    description: "Cobrança + assinaturas.",
    category: "cobranca",
    auth_mode: "api_key",
    fields: [{ key: "IUGU_API_TOKEN", label: "API Token", type: "password", required: true }],
  },

  // E-commerce (OAuth)
  {
    slug: "mercado-livre",
    name: "Mercado Livre",
    description: "Marketplace — pedidos, vendas e estoque.",
    category: "ecommerce",
    auth_mode: "oauth",
    oauth_route: "/integrations/mercado-livre",
  },
  {
    slug: "nuvemshop",
    name: "Nuvemshop",
    description: "E-commerce — pedidos e produtos.",
    category: "ecommerce",
    auth_mode: "oauth",
    oauth_route: "/integrations/nuvemshop",
  },

  // Database (rota dedicada)
  {
    slug: "supabase",
    name: "Supabase",
    description: "Conecte N projetos — Marcos acessa dados via MCP.",
    category: "database",
    auth_mode: "api_key",
    custom_route: "/integrations/supabase",
  },
];
