import { Input } from "@/components/ui/input";
import { formatBRL, parseBRLInput } from "./constants";

export function MoneyInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Input
      inputMode="numeric"
      placeholder={placeholder ?? "R$ 0,00"}
      value={value ? formatBRL(value) : ""}
      onChange={(e) => onChange(parseBRLInput(e.target.value))}
      className={className}
    />
  );
}
