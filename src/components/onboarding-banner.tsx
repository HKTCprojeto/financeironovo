import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function OnboardingPendingBanner() {
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium">Você ainda não completou a configuração</div>
            <div className="text-xs text-muted-foreground">
              Termine o setup do Marcos em poucos minutos.
            </div>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to="/onboarding">Configurar agora</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
