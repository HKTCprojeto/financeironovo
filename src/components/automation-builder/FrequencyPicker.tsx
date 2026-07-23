import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAYS, parseCron, buildCron, type CronParts } from "./constants";

export function FrequencyPicker({
  expression,
  onChange,
}: {
  expression: string;
  onChange: (expr: string) => void;
}) {
  const parts = parseCron(expression);

  function set(next: CronParts) {
    onChange(buildCron(next));
  }

  function changeKind(kind: CronParts["kind"]) {
    if (kind === "daily") set({ kind: "daily", time: "time" in parts ? parts.time : "09:00" });
    else if (kind === "weekly") set({ kind: "weekly", weekday: "1", time: "time" in parts ? parts.time : "09:00" });
    else if (kind === "monthly") set({ kind: "monthly", day: "1", time: "time" in parts ? parts.time : "09:00" });
    else set({ kind: "custom", expression });
  }

  const time = "time" in parts ? parts.time : "09:00";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">Frequência</Label>
          <Select value={parts.kind} onValueChange={(v) => changeKind(v as CronParts["kind"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Diariamente</SelectItem>
              <SelectItem value="weekly">Semanalmente</SelectItem>
              <SelectItem value="monthly">Mensalmente</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {parts.kind === "weekly" && (
          <div>
            <Label className="text-xs text-muted-foreground">Dia da semana</Label>
            <Select value={parts.weekday} onValueChange={(v) => set({ ...parts, weekday: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {parts.kind === "monthly" && (
          <div>
            <Label className="text-xs text-muted-foreground">Dia do mês</Label>
            <Select value={parts.day} onValueChange={(v) => set({ ...parts, day: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                  <SelectItem key={d} value={d}>Dia {d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {parts.kind !== "custom" && (
          <div>
            <Label className="text-xs text-muted-foreground">Horário</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) =>
                set(
                  parts.kind === "daily"
                    ? { kind: "daily", time: e.target.value }
                    : parts.kind === "weekly"
                    ? { ...parts, time: e.target.value }
                    : { ...parts, time: e.target.value },
                )
              }
            />
          </div>
        )}
      </div>

      {parts.kind === "custom" && (
        <div>
          <Label className="text-xs text-muted-foreground">Expressão cron (avançado)</Label>
          <Input
            value={expression}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono"
            placeholder="0 9 * * 1"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Formato: <span className="font-mono">min hora dia mês dia-semana</span>
          </p>
        </div>
      )}
    </div>
  );
}
