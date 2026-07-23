import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { METRIC_OPTIONS } from "./constants";

const OTHER = "__other__";

export function MetricSelect({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const known = METRIC_OPTIONS.some((m) => m.value === value);
  const [showCustom, setShowCustom] = useState(value && !known);
  const selectValue = showCustom || (value && !known) ? OTHER : value;

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === OTHER) {
            setShowCustom(true);
            if (known) onChange("");
          } else {
            setShowCustom(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder ?? "Escolha um número"} />
        </SelectTrigger>
        <SelectContent>
          {METRIC_OPTIONS.map((m) => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
          <SelectItem value={OTHER}>Outro campo…</SelectItem>
        </SelectContent>
      </Select>
      {(showCustom || (value && !known)) && (
        <Input
          placeholder="Nome técnico do campo (ex: amount_brl)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
        />
      )}
    </div>
  );
}
