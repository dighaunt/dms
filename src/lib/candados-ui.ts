// Traduce el mensaje de un candado del manual (409 de la BD) al elemento de
// la línea de tiempo que lo destraba, para iluminarlo y explicar ahí mismo
// qué falta (mini-gamificación: el candado apunta al siguiente paso).

export type ObjetivoCandado =
  | { tipo: "requisito"; codigo: string }
  | { tipo: "selector-f06" };

export function objetivoDeCandado(mensaje: string): ObjetivoCandado | null {
  // «…se requiere «Nombre» (X-99) …» → el requisito faltante es X-99.
  const requiere = /se requiere (?:el folio de )?«[^»]+» \(([FC]-\d{2})\)/.exec(mensaje);
  if (requiere) return { tipo: "requisito", codigo: requiere[1] };

  // La casilla «Listo para venta» de la carátula: vive en el selector F-06.
  if (/F-06/.test(mensaje) && /Listo para venta/i.test(mensaje)) {
    return { tipo: "selector-f06" };
  }
  return null;
}

/** id de DOM del elemento objetivo, para hacer scroll y resaltar. */
export function idDeObjetivo(objetivo: ObjetivoCandado): string {
  return objetivo.tipo === "selector-f06"
    ? "selector-f06"
    : `requisito-${objetivo.codigo}`;
}

/** Frase de ánimo según el objetivo: qué desbloquea completarlo. */
export function animoDeCandado(objetivo: ObjetivoCandado): string {
  return objetivo.tipo === "selector-f06"
    ? "🎯 Marca la casilla y desbloqueas la venta."
    : "🎯 Completa este paso y el folio se desbloquea.";
}
