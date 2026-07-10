import { BlurFade } from "@/components/ui/blur-fade";
import { MapaDocumental } from "./mapa";

export const dynamic = "force-dynamic";

export default function DocumentacionPage() {
  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Mapa documental M-01
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Qué es cada documento, cuál es su madre y qué destraba. Pica un nodo
            para ver su ficha; las flechas animadas son la regla de oro.
          </p>
        </div>
      </BlurFade>
      <BlurFade delay={0.12}>
        <MapaDocumental />
      </BlurFade>
    </div>
  );
}
