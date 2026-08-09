

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function tokenizar(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const filas = a.length + 1;
  const columnas = b.length + 1;
  const dp: number[][] = Array.from({ length: filas }, () => new Array<number>(columnas).fill(0));
  for (let i = 0; i < filas; i++) dp[i][0] = i;
  for (let j = 0; j < columnas; j++) dp[0][j] = j;

  for (let i = 1; i < filas; i++) {
    for (let j = 1; j < columnas; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[filas - 1][columnas - 1];
}

function toleranciaDe(longitud: number): number {
  if (longitud <= 3) return 0;
  if (longitud <= 6) return 1;
  if (longitud <= 10) return 2;
  return 3;
}

function puntuarToken(tokenConsulta: string, tokenTexto: string): number {
  if (tokenTexto.includes(tokenConsulta)) return 1;
  const distancia = distanciaLevenshtein(tokenConsulta, tokenTexto);
  const tolerancia = toleranciaDe(tokenConsulta.length);
  if (distancia === 0) return 1;
  if (distancia <= tolerancia) return 1 - distancia / (tolerancia + 1);
  return 0;
}

export function puntuarCoincidencia(consulta: string, texto: string): number {
  const consultaNormalizada = normalizar(consulta);
  if (!consultaNormalizada) return 0;

  const textoNormalizado = normalizar(texto);
  if (textoNormalizado.includes(consultaNormalizada)) return 1;

  const tokensConsulta = tokenizar(consulta);
  const tokensTexto = tokenizar(texto);
  if (tokensConsulta.length === 0 || tokensTexto.length === 0) return 0;

  let sumaPuntuacion = 0;
  for (const tokenConsulta of tokensConsulta) {
    let mejor = 0;
    for (const tokenTexto of tokensTexto) {
      const puntuacion = puntuarToken(tokenConsulta, tokenTexto);
      if (puntuacion > mejor) mejor = puntuacion;
      if (mejor === 1) break;
    }
    sumaPuntuacion += mejor;
  }
  const promedio = sumaPuntuacion / tokensConsulta.length;
  return promedio >= 0.34 ? promedio : 0;
}

export type ElementoBuscable = {
  texto: string;
};

export function buscarDifuso<T extends ElementoBuscable>(
  elementos: T[],
  consulta: string,
  limite = 8,
): T[] {
  if (consulta.trim().length < 2) return [];
  return elementos
    .map((elemento) => ({ elemento, puntuacion: puntuarCoincidencia(consulta, elemento.texto) }))
    .filter((resultado) => resultado.puntuacion > 0)
    .sort((a, b) => b.puntuacion - a.puntuacion)
    .slice(0, limite)
    .map((resultado) => resultado.elemento);
}
