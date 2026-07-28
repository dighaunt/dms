import { parseId, requerirUsuario, respuesta404 } from "@/lib/api";
import { creado, cuerpo, responder } from "@/lib/finanzas/api";
import { agregarOtroIngreso, type EntradaOtroIngresoCorte } from "@/lib/finanzas/corte";

/**
 * Asienta el renglón "Otros ingresos" de la Parte I del RCI-07.
 *
 * Es el único ingreso del corte que se teclea. Todos los demás los jala
 * `armar_corte_caja` de los folios firmados del día, y por eso no tienen
 * endpoint: dejar que alguien los capture a mano abriría la puerta a declarar
 * un ingreso que ningún folio respalda.
 *
 * Aquí ocurre lo contrario, y es deliberado: el papel reserva ese renglón, así
 * que un ingreso sin folio existe en la realidad. Negarlo no lo hace
 * desaparecer —lo empuja a declararse como "sobrante" en la Parte III, donde se
 * confunde con un descuadre de caja—, de modo que se admite pero nunca mudo: la
 * base exige concepto de al menos diez caracteres y guarda quién lo capturó.
 *
 * No hay GET: el renglón se lee con el resto del detalle del corte. Un segundo
 * camino de lectura serviría para que la Parte I y el total llegaran a contar
 * cosas distintas.
 *
 * Sobre un corte que ya no es borrador la función levanta P0001, que `responder`
 * convierte en 409 con el mensaje del manual.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { usuario, error } = await requerirUsuario();
  if (error) return error;

  const id = parseId((await params).id);
  if (id === null) return respuesta404("Corte no encontrado");

  const datos = (await cuerpo(request)) as Record<string, unknown>;
  return responder(
    () => agregarOtroIngreso(id, datos as EntradaOtroIngresoCorte, usuario.id),
    creado,
  );
}
