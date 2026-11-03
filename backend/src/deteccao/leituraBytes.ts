/**
 * Leitura de uma linha direto dos bytes do arquivo, sem criar strings.
 *
 * Só o formato comum dos dados passa pelo caminho rápido: id com dígitos, facção curta sem aspas,
 * timestamp com aspas só nas pontas, latitude/longitude como -?ddd.ddddd, "true"/"false" e
 * lista de restrição só com dígitos e vírgulas. Qualquer outra coisa devolve COMPLEXA, e o
 * detector decodifica a linha e usa o parseLine original. Assim o resultado é idêntico ao do
 * parseLine por construção; só o caso comum fica mais rápido.
 */
import type { MonitoredEntity } from './types';

export const SIMPLES = 0;
export const COMPLEXA = 1;
/** Menos de 6 campos: o parseLine também recusaria. */
export const INVALIDA = 2;

/** Onde está o timestamp (já sem as aspas) na última linha SIMPLES lida. */
export const posTs = { ini: 0, fim: 0 };

const POT10 = [1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15];
const PV = 59, ASPAS = 34, VIRGULA = 44, MENOS = 45, PONTO = 46, ESPACO = 32;

/**
 * Número decimal simples (-?dígitos[.dígitos], até 15 dígitos), ou NaN para "use o parseFloat".
 * Inteiro exato ÷ potência de 10 exata é arredondado corretamente pelo IEEE 754, então o
 * resultado é o mesmo double que o parseFloat daria para o mesmo texto.
 */
function numeroSimples(buf: Buffer, a: number, b: number): number {
  let i = a, neg = false;
  if (i < b && buf[i] === MENOS) { neg = true; i++; }
  let v = 0, dig = 0, dec = -1;
  for (; i < b; i++) {
    const c = buf[i];
    if (c >= 48 && c <= 57) { v = v * 10 + (c - 48); dig++; if (dec >= 0) dec++; }
    else if (c === PONTO && dec < 0) dec = 0;
    else return NaN;
  }
  if (dig === 0 || dig > 15 || dec === 0) return NaN;
  const r = dec > 0 ? v / POT10[dec] : v;
  return neg ? -r : r;
}

/** Preenche `ent` com a linha [s, e) do buffer. Não mexe em ent.timestamp (use posTs). */
export function lerLinhaBytes(buf: Buffer, s: number, e: number, ent: MonitoredEntity, cacheFaccao: Map<number, string>): number {
  let p1 = -1, p2 = -1, p3 = -1, p4 = -1, p5 = -1, p6 = -1;
  for (let i = s; i < e; i++) {
    if (buf[i] !== PV) continue;
    if (p1 < 0) p1 = i; else if (p2 < 0) p2 = i; else if (p3 < 0) p3 = i;
    else if (p4 < 0) p4 = i; else if (p5 < 0) p5 = i; else { p6 = i; break; }
  }
  if (p5 < 0) return INVALIDA;

  // id: só dígitos
  if (p1 === s || p1 - s > 15) return COMPLEXA;
  let id = 0;
  for (let i = s; i < p1; i++) {
    const c = buf[i];
    if (c < 48 || c > 57) return COMPLEXA;
    id = id * 10 + (c - 48);
  }

  // facção: vazia, ou até 6 caracteres [0-9A-Za-z_-], guardada em cache (poucos valores distintos)
  let faccao = '';
  const nf = p2 - p1 - 1;
  if (nf > 0) {
    if (nf > 6) return COMPLEXA;
    let k = 0;
    for (let i = p1 + 1; i < p2; i++) {
      const c = buf[i];
      const ok = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === MENOS;
      if (!ok) return COMPLEXA;
      k = k * 256 + c;
    }
    k = k * 8 + nf;
    let f = cacheFaccao.get(k);
    if (f === undefined) { f = buf.toString('latin1', p1 + 1, p2); cacheFaccao.set(k, f); }
    faccao = f;
  }

  // timestamp: aspas só nas pontas, ASCII imprimível, sem espaço nas bordas
  let a = p2 + 1, b = p3;
  if (b - a >= 2 && buf[a] === ASPAS && buf[b - 1] === ASPAS) { a++; b--; }
  for (let i = a; i < b; i++) {
    const c = buf[i];
    if (c === ASPAS || c < 32 || c > 126) return COMPLEXA;
  }
  if (a < b && (buf[a] === ESPACO || buf[b - 1] === ESPACO)) return COMPLEXA;

  const lat = numeroSimples(buf, p3 + 1, p4);
  if (lat !== lat) return COMPLEXA; // NaN
  const lon = numeroSimples(buf, p4 + 1, p5);
  if (lon !== lon) return COMPLEXA;

  // medidaProtetiva: exatamente "true" ou "false"
  const fimProt = p6 < 0 ? e : p6;
  const np = fimProt - p5 - 1;
  let vitima: boolean;
  if (np === 4 && buf[p5 + 1] === 116 && buf[p5 + 2] === 114 && buf[p5 + 3] === 117 && buf[p5 + 4] === 101) vitima = true;
  else if (np === 5 && buf[p5 + 1] === 102 && buf[p5 + 2] === 97 && buf[p5 + 3] === 108 && buf[p5 + 4] === 115 && buf[p5 + 5] === 101) vitima = false;
  else return COMPLEXA;

  // restrições: dígitos separados por vírgula, com aspas opcionais nas pontas
  const ids = ent.idsRestricaoMedida;
  ids.length = 0;
  if (p6 >= 0) {
    let x = p6 + 1, y = e;
    if (y - x >= 2 && buf[x] === ASPAS && buf[y - 1] === ASPAS) { x++; y--; }
    let v = 0, dig = 0;
    for (let i = x; i < y; i++) {
      const c = buf[i];
      if (c >= 48 && c <= 57) { v = v * 10 + (c - 48); if (++dig > 15) return COMPLEXA; }
      else if (c === VIRGULA) { if (dig) ids.push(v); v = 0; dig = 0; }
      else return COMPLEXA;
    }
    if (dig) ids.push(v);
  }

  ent.id = id;
  ent.faccao = faccao;
  ent.latitude = lat;
  ent.longitude = lon;
  ent.medidaProtetiva = vitima;
  posTs.ini = a;
  posTs.fim = b;
  return SIMPLES;
}

/** Os bytes [a, b) são iguais aos de `ref`? */
export function bytesIguais(buf: Buffer, a: number, b: number, ref: Buffer): boolean {
  if (b - a !== ref.length) return false;
  for (let i = 0; i < ref.length; i++) if (buf[a + i] !== ref[i]) return false;
  return true;
}
