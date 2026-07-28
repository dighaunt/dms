import Link from "next/link";
import { redirect } from "next/navigation";

import { BlurFade } from "@/components/ui/blur-fade";
import { getUsuarioSesion } from "@/lib/auth/usuario";
import { listarPersonas, pagosPorPersona } from "@/lib/finanzas/personas";

import { PanelPersonas, type PersonaEnPantalla } from "./panel-personas";

export const dynamic = "force-dynamic";

/**
 * El catálogo se lee entero para poder buscar sin ir y venir al servidor. No
 * es una lista de clientes: es la gente a la que se le paga de forma
 * recurrente, y eso se cuenta por decenas o cientos, no por miles.
 */
const TOPE_PERSONAS = 500;

/**
 * Catálogo de personas: a quién se le paga.
 *
 * Existe por una razón concreta y medible: mientras el nombre de quien recibe
 * el dinero fue texto libre, a un proveedor semanal se le reescribía el nombre
 * cincuenta veces al año y bastaba una letra distinta —"Refaccionaria del
 * Norte" contra "Refaccionaria del Nte."— para que nadie pudiera sumar cuánto
 * se le había pagado. Por eso la columna que importa de esta pantalla es la
 * última: lo pagado a cada quien.
 *
 * El texto libre NO se quita del vale. A veces se le paga a alguien una sola
 * vez en la vida y darlo de alta sería un estorbo; este catálogo es para el
 * otro caso.
 */
export default async function PersonasFinanzasPage() {
  const sesion = await getUsuarioSesion();
  if (!sesion) redirect("/login");

  /**
   * Escribir el catálogo lo reserva la ruta a la administración global (N3),
   * el mismo nivel que ya piden sucursales y personal. Aquí sólo se decide qué
   * se dibuja; el candado real vive allá. Capturar un vale no depende de esto:
   * el nombre de quien recibe se puede escribir libremente.
   */
  const puedeAdministrar = sesion.nivel === "N3";

  const [personas, pagos] = await Promise.all([
    // Con las dadas de baja: es la única pantalla desde la que se reactivan.
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
      // Sólo vales FIRMADOS: son los únicos que movieron dinero.
      vales: pago?.vales ?? 0,
      totalPagado: pago?.totalPagado ?? "0.00",
      ultimoPago: pago?.ultimoPago ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <BlurFade delay={0.05}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo de personas</h1>
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
