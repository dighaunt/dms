// Límites del dato maestro de una unidad. Se comparten entre formulario,
// API y contrato SQL para que una pantalla no acepte algo que otra rechaza.
export const LONGITUD_MAXIMA_DATO_UNIDAD = 100;
export const MAXIMO_KILOMETRAJE_UNIDAD = 2_147_483_647;
// El formato C-01 dice “refrendos al año”: es el año del último refrendo,
// no la cantidad de refrendos. Los contratos históricos usan, por ejemplo,
// 2026, y ese valor debe poder viajar como dato maestro.
export const MINIMO_ANIO_REFRENDO = 1980;
export const MAXIMO_ANIO_REFRENDO = 2100;
