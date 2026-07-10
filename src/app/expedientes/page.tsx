import Link from "next/link";

import { listarExpedientes } from "@/lib/db/consultas";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { TablaExpedientes } from "./tabla-expedientes";

export const dynamic = "force-dynamic";

export default async function ExpedientesPage() {
  const expedientes = await listarExpedientes();

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Expedientes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Un expediente = un VIN = un folio.
            </p>
          </div>
          <Button asChild>
            <Link href="/expedientes/nuevo">Abrir expediente</Link>
          </Button>
        </div>
      </BlurFade>

      <BlurFade delay={0.12}>
        <TablaExpedientes expedientes={expedientes} />
      </BlurFade>
    </div>
  );
}
