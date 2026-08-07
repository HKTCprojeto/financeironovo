-- Separa o endereco do dashboard do OpenClaw do endereco do bridge da Livia.
--
-- Ate aqui `instances.ingress_url` servia a dois consumidores com destinos
-- diferentes: o chat da Livia (que precisa do bridge, 127.0.0.1:18790 exposto
-- por quick tunnel) e o Mission Control / "Abrir OpenClaw" (que precisa do
-- gateway, https://openclaw.hktcstore.com.br). Como o `heartbeat` reescreve
-- `ingress_url` a cada 4 min com a URL do bridge, o dashboard sempre perdia:
-- abria no bridge e recebia {"error":"not found"}.
--
-- Campo proprio, que o heartbeat NAO toca.

ALTER TABLE public.instances
  ADD COLUMN IF NOT EXISTS openclaw_dashboard_url text;

COMMENT ON COLUMN public.instances.openclaw_dashboard_url IS
  'URL publica do gateway OpenClaw (Mission Control / dashboard). Nao confundir com ingress_url, que aponta para o bridge da Livia e e reescrito pelo heartbeat. Se nulo, as functions caem de volta em ingress_url.';

-- Instalacao unica da HKTC: o gateway responde neste hostname desde a janela de
-- manutencao de 2026-08-07 (antes o ingress do tunel apontava para um IP
-- tailscale inalcancavel e devolvia 502).
UPDATE public.instances
   SET openclaw_dashboard_url = 'https://openclaw.hktcstore.com.br'
 WHERE openclaw_dashboard_url IS NULL;
