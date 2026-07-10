const FORMATEADOR_ENTEROS = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/** Conserva únicamente los dígitos de un entero no negativo. */
export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Separa millares sin alterar el valor numérico que se guarda. */
export function separarMiles(
  valor: string | number | null | undefined,
): string {
  if (valor == null || valor === "") return "";

  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return "";
    return FORMATEADOR_ENTEROS.format(Math.trunc(valor));
  }

  const digitos = soloDigitos(valor);
  return digitos === "" ? "" : FORMATEADOR_ENTEROS.format(BigInt(digitos));
}
