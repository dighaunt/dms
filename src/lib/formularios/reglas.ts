/**
 * Motor de reglas condicionales del formulario.
 *
 * Vive fuera de `catalogo.ts` para que el wizard lo use sin arrastrar
 * `catalogo-generado.json` al bundle del navegador. Servidor y pantalla tienen
 * que decidir "obligatorio" con exactamente el mismo criterio: si divergen, la
 * validación final reclama datos que la interfaz ya resolvió y ocultó.
 */

export type ReglaFormulario = {
  when: { field: string; equals: string };
  require?: string[];
  fill?: Record<string, string>;
};

/** Valores que imponen ahora mismo las reglas cuya condición se cumple. */
export function rellenosActivos(
  rules: ReglaFormulario[],
  values: Record<string, string>,
): Map<string, string> {
  const activos = new Map<string, string>();
  for (const rule of rules) {
    if (values[rule.when.field] !== rule.when.equals) continue;
    for (const [name, value] of Object.entries(rule.fill ?? {})) activos.set(name, value);
  }
  return activos;
}

export function aplicarReglasFormulario(
  rules: ReglaFormulario[],
  input: Record<string, string>,
): Record<string, string> {
  const values = { ...input };
  const activos = rellenosActivos(rules, values);

  // Si una condición dejó de cumplirse, retira únicamente el valor que esa
  // misma regla había generado. Así SIN garantía -> CON garantía no conserva
  // un NO APLICA que podría hacer pasar una validación incorrecta.
  for (const rule of rules) {
    for (const [name, automaticValue] of Object.entries(rule.fill ?? {})) {
      if (!activos.has(name) && values[name] === automaticValue) values[name] = "";
    }
  }
  for (const [name, value] of activos) values[name] = value;
  return values;
}

/**
 * El AcroForm marca `required` en todos los huecos de una cláusula sin
 * distinguir la condición que los activa: los días, kilómetros y cobertura de
 * la garantía C-02 llegan obligatorios aunque el contrato se firme SIN
 * garantía. Un campo que una regla vigente está anulando no lo captura nadie
 * —su valor lo pone la regla— y el wizard ni siquiera lo muestra, así que
 * exigirlo produce un error de datos faltantes imposible de resolver.
 *
 * `require` de una regla vigente gana sobre `fill` de otra: la condición que
 * pide el dato real es la que manda.
 */
export function camposRequeridosPorReglas(
  rules: ReglaFormulario[],
  baseRequired: Iterable<string>,
  values: Record<string, string>,
): Set<string> {
  const required = new Set(baseRequired);
  const anulados = new Set(rellenosActivos(rules, values).keys());
  for (const rule of rules) {
    if (values[rule.when.field] !== rule.when.equals) continue;
    for (const name of rule.require ?? []) {
      required.add(name);
      anulados.delete(name);
    }
  }
  for (const name of anulados) required.delete(name);
  return required;
}
