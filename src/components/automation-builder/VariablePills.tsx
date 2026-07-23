import { Button } from "@/components/ui/button";
import { AVAILABLE_VARIABLES } from "./constants";

export function VariablePills({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="text-[11px] text-muted-foreground self-center mr-1">Variáveis:</span>
      {AVAILABLE_VARIABLES.map((v) => (
        <Button
          key={v.token}
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10px] font-mono"
          title={v.label}
          onClick={() => onInsert(v.token)}
        >
          {v.token}
        </Button>
      ))}
    </div>
  );
}
