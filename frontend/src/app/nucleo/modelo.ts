/**
 * Modelo derivado dos dados brutos: datasets com cadastro, encontros enriquecidos,
 * pessoas com seus totais, e as agregações usadas pelos indicadores.
 */
import type { DadosPainel, Execucao, LatLon, TipoEncontro, Validacao, ValidacaoDataset } from '../../../../shared/contrato.js';
import { INTERVALO_LEITURA_MS, STACK, TIPOS } from './constantes.js';
import { tsMs } from './formato.js';

export interface DsInfo {
  n: number;
  /** Um dos 7 datasets do desafio (os demais foram incluídos depois). */
  oficial: boolean;
  pessoas: Record<string, [string, boolean, number[]]>;
  vitimas: number[];
  monitorados: number[];
  temCadastro: boolean;
  /** Primeira e última leitura (ms UTC). 0 quando não há cadastro. */
  ini: number;
  fim: number;
}

export interface Enc {
  key: string;
  ds: number;
  tipo: TipoEncontro;
  a: number;
  b: number;
  ts: string;
  t: number;
  pa: LatLon;
  pb: LatLon;
  lat: number;
  lon: number;
  m: number;
  fa: string;
  fb: string;
  va: boolean;
  vb: boolean;
  /** Facção comum (só em encontros de facção). */
  faccao: string;
  vit: number | null;
  agr: number | null;
}

export interface Pessoa {
  key: string;
  ds: number;
  id: number;
  fac: string;
  vit: boolean;
  restr: number[];
  restringidoPor: number[];
  enc: number;
  c: Record<TipoEncontro, number>;
  minM: number | null;
  first: string;
}

export interface Episodio {
  ds: number;
  a: number;
  b: number;
  tipo: TipoEncontro;
  vit: number | null;
  agr: number | null;
  start: number;
  end: number;
  n: number;
  minM: number;
  /** Duração em segundos (uma leitura vale 5 s). */
  dur: number;
}

export interface Modelo {
  dados: DadosPainel;
  DS: DsInfo[];
  DSN: Record<number, DsInfo>;
  EXEC: Record<number, Execucao>;
  VAL: Validacao | null;
  ENC: Enc[];
  BYKEY: Record<string, Enc>;
  PAIRCOUNT: Record<string, number>;
  PES: Pessoa[];
  FACS: string[];
}

/** Modelo atual. Mutado por montarModelo, para que todos os módulos vejam a versão mais recente. */
export const M = {} as Modelo;

export const pairKey = (e: { ds: number; a: number; b: number }): string => `${e.ds}:${e.a}-${e.b}`;
const contarTipos = (lista: { tipo: TipoEncontro }[]): Record<TipoEncontro, number> =>
  Object.fromEntries(TIPOS.map(t => [t.k, lista.filter(e => e.tipo === t.k).length])) as Record<TipoEncontro, number>;

export function montarModelo(D: DadosPainel): Modelo {
  const DS: DsInfo[] = D.datasets.map(ds => {
    const p = ds.cadastro ? ds.cadastro.pessoas : {};
    const ids = Object.keys(p);
    // Período: se o último timestamp do arquivo estiver fora do formato, usa o maior instante válido dos encontros
    const ini = ds.cadastro ? tsMs(ds.cadastro.inicio) : NaN;
    const fimLido = ds.cadastro ? tsMs(ds.cadastro.fim) : NaN;
    const tsEnc = ds.encontros.map(e => tsMs(e.ts)).filter(Number.isFinite);
    const fim = Number.isFinite(fimLido) ? fimLido : Math.max(ini, ...tsEnc);
    const periodoOk = Number.isFinite(ini) && Number.isFinite(fim);
    return {
      n: ds.n,
      oficial: ds.oficial ?? ds.n <= 7,
      pessoas: p,
      vitimas: ids.filter(id => p[id][1]).map(Number),
      monitorados: ids.filter(id => !p[id][1]).map(Number),
      temCadastro: !!ds.cadastro && periodoOk,
      ini: periodoOk ? ini : 0,
      fim: periodoOk ? fim : 0
    };
  });
  const DSN = Object.fromEntries(DS.map(d => [d.n, d])) as Record<number, DsInfo>;
  const EXEC = Object.fromEntries((D.execucao || []).map(r => [r.dataset, r])) as Record<number, Execucao>;

  const ENC: Enc[] = D.datasets.flatMap(ds => ds.encontros.map((e, i) => {
    const p = DSN[ds.n].pessoas;
    const info = (id: number): [string, boolean, number[]] => p[String(id)] || ['', false, []];
    const [fa, va] = info(e.a), [fb, vb] = info(e.b);
    let vit: number | null = null, agr: number | null = null;
    if (e.tipo === 'protetiva') { if (va) { vit = e.a; agr = e.b; } else { vit = e.b; agr = e.a; } }
    return {
      key: `${ds.n}-${i}`, ds: ds.n, tipo: e.tipo, a: e.a, b: e.b, ts: e.ts, t: tsMs(e.ts),
      pa: e.pa, pb: e.pb, lat: (e.pa[0] + e.pb[0]) / 2, lon: (e.pa[1] + e.pb[1]) / 2,
      m: e.m, fa, fb, va, vb, faccao: e.tipo === 'faccao' ? fa : '', vit, agr
    };
  }));
  const BYKEY = Object.fromEntries(ENC.map(e => [e.key, e]));
  const PAIRCOUNT: Record<string, number> = {};
  ENC.forEach(e => { const k = pairKey(e); PAIRCOUNT[k] = (PAIRCOUNT[k] || 0) + 1; });

  const PES: Pessoa[] = DS.flatMap(d => Object.entries(d.pessoas).map(([idStr, [fac, vit, restr]]) => {
    const id = Number(idStr);
    const enc = ENC.filter(e => e.ds === d.n && (e.a === id || e.b === id));
    return {
      key: `${d.n}:${id}`, ds: d.n, id, fac, vit, restr,
      restringidoPor: vit ? [] : d.vitimas.filter(v => d.pessoas[String(v)][2].includes(id)),
      enc: enc.length, c: contarTipos(enc),
      minM: enc.length ? Math.min(...enc.map(e => e.m)) : null,
      first: enc.length ? enc.map(e => e.ts).sort()[0] : ''
    };
  }));
  const FACS = [...new Set(PES.map(p => p.fac).filter(Boolean))].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

  return Object.assign(M, { dados: D, DS, DSN, EXEC, VAL: D.validacao, ENC, BYKEY, PAIRCOUNT, PES, FACS });
}

/* ---------- Agregações (recebem a lista de datasets do recorte) ---------- */

export const contagemPorTipo = contarTipos;

export function encOf(dss: DsInfo[]): Enc[] {
  const s = new Set(dss.map(d => d.n));
  return M.ENC.filter(e => s.has(e.ds));
}

/** Leituras seguidas (a cada 5 s) do mesmo par formam um episódio. */
export function episodesOf(E: Enc[]): Episodio[] {
  const g = new Map<string, Enc[]>();
  E.forEach(e => { const k = pairKey(e); if (!g.has(k)) g.set(k, []); g.get(k)!.push(e); });
  const out: Episodio[] = [];
  for (const list of g.values()) {
    list.sort((a, b) => a.t - b.t);
    let cur: Episodio | null = null;
    for (const e of list) {
      if (cur && e.t - cur.end <= INTERVALO_LEITURA_MS) { cur.end = e.t; cur.n++; cur.minM = Math.min(cur.minM, e.m); }
      else {
        cur = { ds: e.ds, a: e.a, b: e.b, tipo: e.tipo, vit: e.vit, agr: e.agr, start: e.t, end: e.t, n: 1, minM: e.m, dur: 0 };
        out.push(cur);
      }
    }
  }
  out.forEach(ep => { ep.dur = (ep.end - ep.start + INTERVALO_LEITURA_MS) / 1000; });
  return out;
}

export const pessoasOf = (d: DsInfo): number => d.vitimas.length + d.monitorados.length;

/**
 * Soma de pessoas × horas cobertas por cada dataset. Com período (de/até em ms), conta só a
 * parte do monitoramento que cai dentro dele.
 */
export function horasPessoa(dss: DsInfo[], de: number | null = null, ate: number | null = null): number {
  return dss.reduce((s, d) => {
    if (!d.temCadastro) return s;
    const ini = Math.max(d.ini, de ?? -Infinity);
    const fim = Math.min(d.fim + INTERVALO_LEITURA_MS, ate ?? Infinity);
    return s + pessoasOf(d) * (Math.max(0, fim - ini) / 3.6e6);
  }, 0);
}

/** facção -> número de monitorados membros. */
export function facMembers(dss: DsInfo[]): Map<string, number> {
  const m = new Map<string, number>();
  dss.forEach(d => d.monitorados.forEach(id => {
    const f = d.pessoas[String(id)][0];
    if (f) m.set(f, (m.get(f) || 0) + 1);
  }));
  return m;
}

export const exOf = (dss: DsInfo[]): Execucao[] => dss.map(d => M.EXEC[d.n]).filter(Boolean);

export function valOf(dss: DsInfo[], fonte: ValidacaoDataset['fonte']): ValidacaoDataset[] {
  if (!M.VAL) return [];
  const s = new Set(dss.map(d => d.n));
  return M.VAL.datasets.filter(v => v.fonte === fonte && s.has(v.dataset));
}

/** Ordena encontros para desenhar os mais graves por cima. */
export const porEmpilhamento = (a: Enc, b: Enc): number => STACK.indexOf(a.tipo) - STACK.indexOf(b.tipo);
