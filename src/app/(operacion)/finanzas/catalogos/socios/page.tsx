import Link from "next/link";
import { redirect } from "next/navigation";
import { HandshakeIcon } from "lucide-react";

import { BlurFade } from "@/components/ui/blur-fade";
import { getUsuarioSesion } from "@/lib/auth/usuario";
import { listarPersonas, listarSocios } from "@/lib/finanzas/personas";

import { PanelSocios, type PersonaCandidata, type SocioEnPantalla } from "./panel-socios";

export const dynamic = "force-dynamic";

const TOPE_PERSONAS = 500;

export default async function SociosFinanzasPage() {
  const sesion = await getUsuarioSesion();
  if (!sesion) redirect("/login");

  const puedeAdministrar = sesion.nivel === "N3";

  const [socios, personas] = await Promise.all([

    listarSocios({ soloActivos: false }),
    puedeAdministrar
      ? listarPersonas({ soloActivas: true, limite: TOPE_PERSONAS })
      : Promise.resolve([]),
  ]);

  
  
  const filas: SocioEnPantalla[] = socios.map((socio) => ({
    personaId: socio.personaId,
    nombre: socio.nombre,
    participacionPct: socio.participacionPct,
    actaReferencia: socio.actaReferencia,
    fechaAlta: socio.fechaAlta,
    fechaBaja: socio.fechaBaja,
    activo: socio.activo,
    totalAnticipos: socio.totalAnticipos,
    totalRepartido: socio.totalRepartido,
    saldoPorComprobar: socio.saldoPorComprobar,
    tieneSaldoPorComprobar: socio.tieneSaldoPorComprobar,
    etiquetaPosicion: socio.etiqueta,
  }));

  
  const yaSocios = new Set(socios.filter((s) => s.activo).map((socio) => socio.personaId));
  const candidatas: PersonaCandidata[] = personas
    .filter((persona) => !yaSocios.has(persona.id))
    .map((persona) => ({ id: persona.id, nombre: persona.nombre, categoria: persona.categoria }));

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          {}
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <HandshakeIcon className="size-5 shrink-0" />
            Registro de socios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quién tiene parte del capital social. No es la lista de usuarios del sistema: un
            accionista rara vez opera el DMS, y quien opera el DMS casi nunca es accionista. De
            aquí, y sólo de aquí, sale el selector del retiro de utilidades.{" "}
            <Link href="/finanzas/catalogos" className="underline">
              Volver a catálogos
            </Link>
          </p>
        </div>
      </BlurFade>

      <BlurFade delay={0.12}>
        <PanelSocios
          socios={filas}
          personas={candidatas}
          puedeAdministrar={puedeAdministrar}
          hayPersonas={personas.length > 0}
        />
      </BlurFade>
    </div>
  );
}
