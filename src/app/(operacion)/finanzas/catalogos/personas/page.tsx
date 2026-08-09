import Link from "next/link";
import { redirect } from "next/navigation";
import { UsersIcon } from "lucide-react";

import { BlurFade } from "@/components/ui/blur-fade";
import { getUsuarioSesion } from "@/lib/auth/usuario";
import { listarPersonas, pagosPorPersona } from "@/lib/finanzas/personas";

import { PanelPersonas, type PersonaEnPantalla } from "./panel-personas";

export const dynamic = "force-dynamic";

const TOPE_PERSONAS = 500;

export default async function PersonasFinanzasPage() {
  const sesion = await getUsuarioSesion();
  if (!sesion) redirect("/login");

  const puedeAdministrar = sesion.nivel === "N3";

  const [personas, pagos] = await Promise.all([
    
    listarPersonas({ soloActivas: false, limite: TOPE_PERSONAS }),
    pagosPorPersona(),
  ]);

  const pagosPorId = new Map(pagos.map((fila) => [fila.personaId, fila]));

  const filas: PersonaEnPantalla[] = personas.map((persona) => {
    const pago = pagosPorId.get(persona.id);
    return {
      id: persona.id,
      nombre: persona.nombre,
      idTipo: persona.idTipo,
      idNumero: persona.idNumero,
      rfc: persona.rfc,
      telefono: persona.telefono,
      domicilio: persona.domicilio,
      categoria: persona.categoria,
      notas: persona.notas,
      activa: persona.activa,
      
      vales: pago?.vales ?? 0,
      totalPagado: pago?.totalPagado ?? "0.00",
      ultimoPago: pago?.ultimoPago ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          {}
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <UsersIcon className="size-5 shrink-0" />
            Catálogo de personas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A quién se le paga. Estar aquí no obliga a nada: en el vale de egreso el nombre se
            puede seguir escribiendo libremente, y elegir la ficha sólo sirve para no volver a
            teclearla y para poder sumar lo que se le ha pagado.{" "}
            <Link href="/finanzas/catalogos" className="underline">
              Volver a catálogos
            </Link>
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.12}>
        <PanelPersonas personas={filas} puedeAdministrar={puedeAdministrar} />
      </BlurFade>
    </div>
  );
}
