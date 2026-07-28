import Link from "next/link";
import { redirect } from "next/navigation";

import { BlurFade } from "@/components/ui/blur-fade";
import { getUsuarioSesion } from "@/lib/auth/usuario";
import { listarPersonas, listarSocios } from "@/lib/finanzas/personas";

import { PanelSocios, type PersonaCandidata, type SocioEnPantalla } from "./panel-socios";

export const dynamic = "force-dynamic";

const TOPE_PERSONAS = 500;

/**
 * Registro de socios: quién tiene parte del capital social.
 *
 * No se deduce del padrón de usuarios. Ser socio es una condición jurídica y
 * tener cuenta en el DMS es otra cosa; mientras el selector del retiro de
 * utilidades se llenó con `SELECT u.id FROM usuario WHERE activo`, elegir mal
 * al accionista era cuestión de un clic —el anticipo se le cargaba a quien no
 * era— y la caja podía entregar un "retiro de utilidades" a alguien sin
 * derecho a utilidad alguna, sin que el sistema objetara nada.
 *
 * El socio se registra SOBRE LA PERSONA y no sobre el usuario: en una agencia
 * el accionista rara vez opera el sistema.
 */
export default async function SociosFinanzasPage() {
  const sesion = await getUsuarioSesion();
  if (!sesion) redirect("/login");

  /**
   * Dar de alta a un socio es asentar quién es dueño de parte de la empresa, y
   * se acredita con un acta: se reserva a la administración global (N3). La
   * consulta queda abierta —la posición de cada socio ya se enseña al capturar
   * un retiro— y el candado real vive en la ruta.
   */
  const puedeAdministrar = sesion.nivel === "N3";

  const [socios, personas] = await Promise.all([
    // Con los dados de baja: un socio que salió sigue explicando los vales que
    // firmó, y su saldo por comprobar sigue contando.
    listarSocios({ soloActivos: false }),
    puedeAdministrar
      ? listarPersonas({ soloActivas: true, limite: TOPE_PERSONAS })
      : Promise.resolve([]),
  ]);

  // `listarSocios` ya trae la posición de cada uno: la etiqueta la redacta
  // `posicionSocio` —es la regla del artículo 19 dicha en palabras— y aquí no
  // se reescribe.
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

  // Sólo se excluye a los VIGENTES: quien fue dado de baja puede reingresar, y
  // entonces se registra otra vez con el acta nueva que lo sustenta.
  const yaSocios = new Set(socios.filter((s) => s.activo).map((socio) => socio.personaId));
  const candidatas: PersonaCandidata[] = personas
    .filter((persona) => !yaSocios.has(persona.id))
    .map((persona) => ({ id: persona.id, nombre: persona.nombre, categoria: persona.categoria }));

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Registro de socios</h1>
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
