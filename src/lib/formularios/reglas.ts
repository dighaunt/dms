

export type ReglaFormulario = {
  when: { field: string; equals: string };
  require?: string[];
  fill?: Record<string, string>;
};

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

  
  
  for (const rule of rules) {
    for (const [name, automaticValue] of Object.entries(rule.fill ?? {})) {
      if (!activos.has(name) && values[name] === automaticValue) values[name] = "";
    }
  }
  for (const [name, value] of activos) values[name] = value;
  return values;
}

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
