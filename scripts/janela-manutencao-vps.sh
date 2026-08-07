#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Janela de manutencao da VPS OpenClaw (178.104.108.79) - HKTC
#
# Duas mudancas, nesta ordem:
#   1) fix        - corrige o ingress do tunel de producao (Mission Control 502)
#   2) reboot     - teste de reboot: prova que a Livia volta sozinha
#
# Rodar como ROOT (login openclaw -> sudo -i).
#
# Subcomandos:
#   bash janela-manutencao-vps.sh check         # so olha, nao muda nada
#   bash janela-manutencao-vps.sh fix           # parte 1 (com rollback automatico)
#   bash janela-manutencao-vps.sh rollback      # desfaz a parte 1 manualmente
#   bash janela-manutencao-vps.sh pre-reboot    # tira a foto do estado atual
#   bash janela-manutencao-vps.sh reboot --confirmo
#   bash janela-manutencao-vps.sh pos-reboot    # valida a volta (rodar apos religar)
#
# NAO TOCA: openclaw-gateway.service, cloudflared-cfo.service, agent main,
#           os 10 crons de producao, ~/.agente-cfo/.env.
# ---------------------------------------------------------------------------

set -u
set -o pipefail

CFG=/etc/cloudflared/config.yml
IP_ERRADO='100.110.4.56:18789'
IP_CERTO='127.0.0.1:18789'
HOST='openclaw.hktcstore.com.br'
ESTADO=/root/janela-manutencao
UNIT_TUNEL=cloudflared          # tunel NOMEADO de producao
UNIT_LIVIA=cloudflared-cfo      # quick tunnel da Livia - nao mexer
BRIDGE=cfo-hooks-bridge
GATEWAY=openclaw-gateway
ENV_CFO=/home/openclaw/.agente-cfo/.env

# URLs de sondagem - todas GET, so leitura, nenhum efeito colateral.
# Cobrem TODAS as regras do config.yml, porque o reload afeta o tunel inteiro.
# Baseline medido em 2026-08-07 (antes da janela):
#   /              502  <- e o que a parte 1 conserta (gateway responde 200 no loopback)
#   /supervisora/  404  <- origem viva, so nao tem index
#   /api/messages  502  <- porta 3978 fora do ar por motivo INDEPENDENTE desta janela
#   /hermes-api/   404  <- origem viva
#   monitor        200  <- unica rota claramente saudavel: e a sentinela do rollback
PROBES=(
  "https://${HOST}/"
  "https://${HOST}/supervisora/"
  "https://${HOST}/api/messages"
  "https://${HOST}/hermes-api/"
  "https://monitor.hktcstore.com.br/"
)

ok()   { printf '  [ok]   %s\n' "$*"; }
info() { printf '  ---    %s\n' "$*"; }
warn() { printf '  [!]    %s\n' "$*"; }
erro() { printf '  [ERRO] %s\n' "$*" >&2; }
titulo() { printf '\n==== %s ====\n' "$*"; }

exige_root() {
  if [ "$(id -u)" -ne 0 ]; then
    erro "precisa rodar como root (sudo -i)"; exit 1
  fi
}

probe() { curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$1" 2>/dev/null || true; }

# piorou <antes> <depois> -> 0 (verdadeiro) se estava saudavel e virou 5xx/sem resposta
piorou() {
  local antes="$1" depois="$2"
  case "$depois" in
    5*|000|"") case "$antes" in 5*|000|"") return 1 ;; *) return 0 ;; esac ;;
    *) return 1 ;;
  esac
}

sondar_todas() { # $1 = arquivo de saida "url<TAB>codigo"
  : > "$1"
  local u c
  for u in "${PROBES[@]}"; do
    c="$(probe "$u")"; [ -n "$c" ] || c=000
    printf '%s\t%s\n' "$u" "$c" >> "$1"
    printf '  %-46s %s\n' "$u" "$c"
  done
}

estado_servicos() {
  local s
  for s in "$GATEWAY" "$UNIT_TUNEL" "$BRIDGE" "$UNIT_LIVIA"; do
    printf '  %-24s ativo=%-10s habilitado=%s\n' \
      "$s" "$(systemctl is-active "$s" 2>/dev/null)" "$(systemctl is-enabled "$s" 2>/dev/null)"
  done
}

# ---------------------------------------------------------------------------
cmd_check() {
  titulo "Arquivo de configuracao do tunel"
  if [ ! -f "$CFG" ]; then erro "$CFG nao existe"; return 1; fi
  sed -n '1,200p' "$CFG"

  titulo "A regra que vamos trocar"
  local n; n="$(grep -c "$IP_ERRADO" "$CFG" 2>/dev/null || echo 0)"
  info "ocorrencias de $IP_ERRADO: $n"
  if [ "$n" -eq 0 ]; then
    if grep -q "$IP_CERTO" "$CFG"; then ok "ja esta em $IP_CERTO - parte 1 nao precisa rodar"
    else warn "nao achei nem o IP errado nem o certo - me manda a saida acima antes de aplicar"; fi
  fi
  grep -q "$HOST" "$CFG" || warn "hostname $HOST nao aparece no config - confirmar antes de aplicar"

  titulo "Servicos"
  estado_servicos

  titulo "Gateway respondendo no loopback?"
  info "127.0.0.1:18789 -> $(probe http://127.0.0.1:18789/)"

  titulo "Sondagem externa (antes)"
  sondar_todas /tmp/janela-probe-check.txt

  titulo "Livia"
  info "bridge healthz -> $(probe http://127.0.0.1:18790/healthz)"
  [ -f "$ENV_CFO" ] && info "INGRESS_URL atual: $(grep -E '^INGRESS_URL=' "$ENV_CFO" | cut -d= -f2-)"
}

# ---------------------------------------------------------------------------
cmd_fix() {
  exige_root
  mkdir -p "$ESTADO"

  titulo "1/6 Conferencia previa"
  [ -f "$CFG" ] || { erro "$CFG nao existe"; return 1; }
  local n; n="$(grep -c "$IP_ERRADO" "$CFG" 2>/dev/null || echo 0)"
  if [ "$n" -eq 0 ]; then
    if grep -q "$IP_CERTO" "$CFG"; then ok "config ja aponta para $IP_CERTO - nada a fazer"; return 0; fi
    erro "nao achei '$IP_ERRADO' em $CFG. Rode 'check' e me manda a saida."; return 1
  fi
  grep -q "$HOST" "$CFG" || { erro "hostname $HOST nao aparece em $CFG - abortando por seguranca"; return 1; }
  ok "$n ocorrencia(s) de $IP_ERRADO para trocar por $IP_CERTO"
  info "gateway no loopback -> $(probe http://127.0.0.1:18789/)"

  titulo "2/6 Sondagem ANTES"
  sondar_todas "$ESTADO/probe-antes.txt"

  titulo "3/6 Backup"
  local BKP="$CFG.bak-$(date +%Y%m%d-%H%M%S)"
  cp -a "$CFG" "$BKP" || { erro "falhou o backup - abortando"; return 1; }
  echo "$BKP" > "$ESTADO/ultimo-backup"
  ok "copia guardada em $BKP"

  titulo "4/6 Aplicando"
  sed -i "s|$IP_ERRADO|$IP_CERTO|g" "$CFG" || { erro "sed falhou"; restaurar "$BKP"; return 1; }
  grep -n "$IP_CERTO" "$CFG" | sed 's/^/  /'
  if cloudflared --config "$CFG" tunnel ingress validate; then
    ok "config validada pelo cloudflared"
  else
    erro "config INVALIDA - desfazendo"; restaurar "$BKP"; return 1
  fi

  titulo "5/6 Recarregando o tunel de producao ($UNIT_TUNEL)"
  info "o $UNIT_LIVIA (Livia) NAO e tocado"
  if [ -n "$(systemctl show -p ExecReload --value "$UNIT_TUNEL" 2>/dev/null)" ]; then
    systemctl reload "$UNIT_TUNEL" || systemctl restart "$UNIT_TUNEL"
  else
    systemctl restart "$UNIT_TUNEL"
  fi
  sleep 12
  if ! systemctl is-active --quiet "$UNIT_TUNEL"; then
    erro "$UNIT_TUNEL nao subiu - desfazendo"
    journalctl -u "$UNIT_TUNEL" -n 30 --no-pager | sed 's/^/  /'
    restaurar "$BKP"; return 1
  fi
  ok "$UNIT_TUNEL ativo"
  journalctl -u "$UNIT_TUNEL" --since '-2 min' --no-pager | tail -n 15 | sed 's/^/  /'

  titulo "6/6 Sondagem DEPOIS e comparacao"
  sondar_todas "$ESTADO/probe-depois.txt"
  local regressao=0 url antes depois
  while IFS=$'\t' read -r url antes; do
    depois="$(awk -v u="$url" -F'\t' '$1==u{print $2}' "$ESTADO/probe-depois.txt")"
    if piorou "$antes" "$depois"; then
      erro "PIOROU: $url  $antes -> $depois"; regressao=1
    else
      printf '  %-46s %s -> %s\n' "$url" "$antes" "$depois"
    fi
  done < "$ESTADO/probe-antes.txt"

  if [ "$regressao" -eq 1 ]; then
    erro "houve regressao - desfazendo automaticamente"
    restaurar "$BKP"
    return 1
  fi

  local principal; principal="$(awk -v u="https://${HOST}/" -F'\t' '$1==u{print $2}' "$ESTADO/probe-depois.txt")"
  case "$principal" in
    5*|000|"") warn "https://${HOST}/ ainda em '$principal' - nada piorou, mas o Mission Control talvez siga fora. Me manda a saida." ;;
    *) ok "https://${HOST}/ agora responde $principal (era $(awk -v u="https://${HOST}/" -F'\t' '$1==u{print $2}' "$ESTADO/probe-antes.txt"))" ;;
  esac
  ok "PARTE 1 CONCLUIDA. Confira o Mission Control no painel antes de seguir para o reboot."
}

restaurar() {
  local bkp="$1"
  warn "restaurando $bkp -> $CFG"
  cp -a "$bkp" "$CFG" && ok "arquivo restaurado"
  systemctl restart "$UNIT_TUNEL"
  sleep 10
  if systemctl is-active --quiet "$UNIT_TUNEL"; then ok "$UNIT_TUNEL ativo de novo"
  else erro "$UNIT_TUNEL NAO subiu apos o rollback - me chama agora"; fi
  info "sondagem pos-rollback:"
  sondar_todas /tmp/janela-probe-rollback.txt
}

cmd_rollback() {
  exige_root
  local bkp; bkp="$(cat "$ESTADO/ultimo-backup" 2>/dev/null || true)"
  [ -n "$bkp" ] && [ -f "$bkp" ] || { erro "nao achei backup em $ESTADO/ultimo-backup"; ls -la "$CFG".bak-* 2>/dev/null; return 1; }
  restaurar "$bkp"
}

# ---------------------------------------------------------------------------
cmd_pre_reboot() {
  exige_root
  mkdir -p "$ESTADO"
  local F="$ESTADO/pre-reboot.txt"
  {
    echo "== foto tirada em $(date -Is)"
    echo "== uptime"; uptime
    echo "== servicos"
    for s in "$GATEWAY" "$UNIT_TUNEL" "$BRIDGE" "$UNIT_LIVIA"; do
      echo "$s ativo=$(systemctl is-active "$s" 2>/dev/null) habilitado=$(systemctl is-enabled "$s" 2>/dev/null)"
    done
    echo "== cron do openclaw (heartbeat)"; crontab -u openclaw -l 2>/dev/null | grep -i heartbeat
    echo "== INGRESS_URL"; grep -E '^INGRESS_URL=' "$ENV_CFO" 2>/dev/null
    echo "== INSTANCE_ID"; grep -E '^INSTANCE_ID=' "$ENV_CFO" 2>/dev/null
    echo "== sondagem externa"
  } > "$F"
  sondar_todas /tmp/janela-probe-pre.txt
  cat /tmp/janela-probe-pre.txt >> "$F"
  cat "$F"

  titulo "Semaforo para o reboot"
  local bloqueio=0
  for s in "$GATEWAY" "$UNIT_TUNEL" "$BRIDGE" "$UNIT_LIVIA"; do
    if [ "$(systemctl is-enabled "$s" 2>/dev/null)" != "enabled" ]; then
      erro "$s NAO esta habilitado no boot - nao vai voltar sozinho"; bloqueio=1
    fi
  done
  crontab -u openclaw -l 2>/dev/null | grep -qi heartbeat || { erro "cron do heartbeat nao encontrado"; bloqueio=1; }
  if [ "$bloqueio" -eq 1 ]; then
    erro "NAO reinicie ainda - resolva os itens acima primeiro."; return 1
  fi
  ok "tudo habilitado no boot. Foto salva em $F"
  ok "pode rodar:  bash $0 reboot --confirmo"
}

cmd_reboot() {
  exige_root
  [ "${1:-}" = "--confirmo" ] || { erro "faltou --confirmo. Uso: bash $0 reboot --confirmo"; return 1; }
  [ -f "$ESTADO/pre-reboot.txt" ] || { erro "rode 'pre-reboot' antes"; return 1; }
  warn "a VPS vai parar por 1 a 3 minutos - nenhuma automacao roda nesse intervalo"
  warn "reiniciando em 10s... (Ctrl+C para abortar)"
  sleep 10
  systemctl reboot
}

cmd_pos_reboot() {
  exige_root
  titulo "Voltou?"
  uptime
  info "se o uptime for de minutos, o reboot aconteceu"

  titulo "Servicos"
  estado_servicos
  local falhou=0 s
  for s in "$GATEWAY" "$UNIT_TUNEL" "$BRIDGE" "$UNIT_LIVIA"; do
    systemctl is-active --quiet "$s" || { erro "$s NAO subiu"; journalctl -u "$s" -n 20 --no-pager | sed 's/^/    /'; falhou=1; }
  done

  titulo "Gateway e bridge"
  info "gateway  127.0.0.1:18789  -> $(probe http://127.0.0.1:18789/)"
  info "bridge   127.0.0.1:18790  -> $(probe http://127.0.0.1:18790/healthz)"

  titulo "Sondagem externa (comparar com a foto)"
  sondar_todas /tmp/janela-probe-pos.txt
  if [ -f "$ESTADO/probe-antes.txt" ] || [ -f /tmp/janela-probe-pre.txt ]; then
    info "foto anterior:"; sed 's/^/    /' "$ESTADO/pre-reboot.txt" 2>/dev/null | tail -n 6
  fi

  titulo "URL do tunel da Livia (muda a cada reboot - o heartbeat corrige em ate 4 min)"
  local url_antes url_agora
  url_antes="$(grep -E '^INGRESS_URL=' "$ESTADO/pre-reboot.txt" 2>/dev/null | cut -d= -f2-)"
  url_agora="$(grep -E '^INGRESS_URL=' "$ENV_CFO" 2>/dev/null | cut -d= -f2-)"
  info "antes do reboot: ${url_antes:-?}"
  info "agora no .env:   ${url_agora:-?}"
  grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' /home/openclaw/.agente-cfo/logs/cloudflared.log 2>/dev/null | tail -n 1 | sed 's/^/  no log do tunel: /'
  if [ -n "$url_agora" ] && [ "$url_agora" = "$url_antes" ]; then
    warn "o .env ainda tem a URL antiga - espere o proximo heartbeat (roda a cada 4 min) e rode 'pos-reboot' de novo"
  elif [ -n "$url_agora" ]; then
    ok "o heartbeat ja atualizou a URL sozinho"
  fi

  titulo "Ultimas linhas do bridge"
  tail -n 15 /home/openclaw/.agente-cfo/logs/bridge.log 2>/dev/null | sed 's/^/  /'

  if [ "$falhou" -eq 1 ]; then
    erro "algum servico nao voltou - me manda a saida acima"
    return 1
  fi
  ok "tudo de pe. Ultimo teste e humano: abra o /chat do painel e mande uma mensagem para a Livia."
}

# ---------------------------------------------------------------------------
case "${1:-}" in
  check)       cmd_check ;;
  fix)         cmd_fix ;;
  rollback)    cmd_rollback ;;
  pre-reboot)  cmd_pre_reboot ;;
  reboot)      shift; cmd_reboot "$@" ;;
  pos-reboot)  cmd_pos_reboot ;;
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
