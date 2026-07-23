import type { Automation, AutomationTrigger, AutomationAction } from "@/types/automations";
import { metricLabel, NUMBER_OPERATOR_LABELS, describeCron, formatBRL, ACTION_META } from "./constants";

function describeTrigger(t: AutomationTrigger): string {
  if (t.type === "manual") return "Marcos rodar manualmente";
  if (t.type === "cron") return describeCron(t.expression);
  if (t.type === "metric") {
    const op = NUMBER_OPERATOR_LABELS[t.operator] ?? t.operator;
    const val = /brl|amount|valor|saldo/i.test(t.metric) ? formatBRL(t.value) : String(t.value);
    return `${metricLabel(t.metric).toLowerCase()} ficar ${op} ${val}`;
  }
  return "—";
}

function describeActions(actions: AutomationAction[]): string {
  if (!actions.length) return "(nenhuma ação ainda)";
  if (actions.length === 1) return ACTION_META[actions[0].type].summary(actions[0]);
  return actions
    .map((a, i) => (i === 0 ? ACTION_META[a.type].summary(a) : `depois ${ACTION_META[a.type].summary(a).toLowerCase()}`))
    .join(", ");
}

export function DescriptiveSentence({ draft }: { draft: Automation }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold mb-1.5">
        O que essa automação faz
      </div>
      <p className="text-base leading-relaxed">
        <span className="font-semibold text-primary">Quando</span>{" "}
        <span>{describeTrigger(draft.trigger)}</span>
        {draft.conditions.length > 0 && (
          <>
            {" "}
            <span className="text-muted-foreground">(com {draft.conditions.length} regra{draft.conditions.length > 1 ? "s" : ""})</span>
          </>
        )}
        ,{" "}
        <span className="font-semibold text-primary">Marcos vai</span>{" "}
        <span>{describeActions(draft.actions)}</span>
        {draft.require_confirmation && (
          <>
            {" "}
            <span className="font-semibold text-primary">com sua confirmação</span>
          </>
        )}
        .
      </p>
    </div>
  );
}
