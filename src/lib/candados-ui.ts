

export type ObjetivoCandado =
  | { tipo: "requisito"; codigo: string }
  | { tipo: "selector-f06" };

export function objetivoDeCandado(mensaje: string): ObjetivoCandado | null {
  
  const requiere = /se requiere (?:el folio de )?«[^»]+» \(([FC]-\d{2})\)/.exec(mensaje);
  if (requiere) return { tipo: "requisito", codigo: requiere[1] };

  if (/F-06/.test(mensaje) && /Listo para venta/i.test(mensaje)) {
    return { tipo: "selector-f06" };
  }
  return null;
}

export function idDeObjetivo(objetivo: ObjetivoCandado): string {
  return objetivo.tipo === "selector-f06"
    ? "selector-f06"
    : `requisito-${objetivo.codigo}`;
}

export function animoDeCandado(objetivo: ObjetivoCandado): string {
  return objetivo.tipo === "selector-f06"
    ? "Marca la casilla y desbloqueas la venta."
    : "Completa este paso y el folio se desbloquea.";
}
