/**
 * Indicadores calculados sobre um recorte. Funções puras, usadas por mais de uma aba,
 * para que o Resumo e as abas de detalhe mostrem sempre o mesmo número.
 */
import type { Execucao, Falha, Funil, TipoEncontro, TipoFalha } from '../../../../shared/contrato.js';
import { TIPOS } from './constantes.js';
import { median, sum } from './formato.js';
import { M, episodesOf, facMembers, horasPessoa, pairKey, type DsInfo, type Enc } from './modelo.js';
import type { Recorte } from './filtros.js';

export function contagemTipos(E: Enc[]): Record<TipoEncontro, number> {
  return Object.fromEntries(TIPOS.map(t => [t.k, E.filter(e => e.tipo === t.k).length])) as Record<TipoEncontro, number>;
}

export interface GrupoVitima { ds: number; vit: number; agr: Set<number>; lista: Enc[]; menor: number }

export function estatVitimas(r: Recorte) {
  const total = r.pes.filter(p => p.vit).length;
  const prot = r.enc.filter(e => e.tipo === 'protetiva');
  const grupos = new Map<string, GrupoVitima>();
  prot.forEach(e => {
    const k = `${e.ds}:${e.vit}`;
    if (!grupos.has(k)) grupos.set(k, { ds: e.ds, vit: e.vit as number, agr: new Set(), lista: [], menor: Infinity });
    const g = grupos.get(k)!;
    g.agr.add(e.agr as number);
    g.lista.push(e);
    g.menor = Math.min(g.menor, e.m);
  });
  const lista = [...grupos.values()].sort((a, b) => b.lista.length - a.lista.length || a.menor - b.menor);

  const eps = episodesOf(prot);
  const porAgressor: Record<string, number> = {};
  eps.forEach(x => { const k = `${x.ds}:${x.agr}`; porAgressor[k] = (porAgressor[k] || 0) + 1; });
  const primeira = lista.map(g => (Math.min(...g.lista.map(e => e.t)) - M.DSN[g.ds].ini) / 1000);
  const inicios: Record<string, number[]> = {};
  eps.forEach(x => { (inicios[`${x.ds}:${x.vit}`] ||= []).push(x.start); });
  const intervalos = Object.values(inicios).filter(a => a.length > 1).flatMap(a => {
    a.sort((x, y) => x - y);
    return a.slice(1).map((t, i) => (t - a[i]) / 1000);
  });

  return {
    total,
    violacoes: prot.length,
    afetadas: lista.length,
    lista,
    maxPorVitima: Math.max(0, ...lista.map(g => g.lista.length)),
    agressores: Object.keys(porAgressor).length,
    agressoresReincidentes: Object.values(porAgressor).filter(n => n > 1).length,
    menor: prot.length ? Math.min(...prot.map(e => e.m)) : null,
    primeiraMediana: primeira.length ? median(primeira) : null,
    primeiraMin: primeira.length ? Math.min(...primeira) : null,
    intervaloMedio: intervalos.length ? sum(intervalos, x => x) / intervalos.length : null,
    intervalos: intervalos.length
  };
}

export function estatFaccoes(r: Recorte) {
  const fac = r.enc.filter(e => e.tipo === 'faccao');
  const membros = facMembers(r.dss);
  const porFac = new Map<string, number>();
  fac.forEach(e => porFac.set(e.faccao, (porFac.get(e.faccao) || 0) + 1));
  const ranking = [...porFac.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
  const [lider, nLider] = ranking[0] ?? ['', 0];
  const empatadas = ranking.filter(([, n]) => n === nLider).length;
  const taxas = ranking.map(([f, n]) => n / (membros.get(f) || 1));
  const totalMembros = sum([...membros.values()], x => x);
  return {
    encontros: fac.length,
    membros,
    totalMembros,
    cadastradas: membros.size,
    ativas: porFac.size,
    ranking,
    lider,
    nLider,
    empatadas,
    /** Todas as facções com a mesma taxa de encontros por membro. */
    taxaUniforme: taxas.length > 1 && Math.max(...taxas) - Math.min(...taxas) < 0.01 ? taxas[0] : null,
    membrosQueSeEncontraram: new Set(fac.flatMap(e => [`${e.ds}:${e.a}`, `${e.ds}:${e.b}`])).size
  };
}

export function estatEncontros(r: Recorte, limite: number) {
  const E = r.enc;
  const eps = episodesOf(E);
  const grupos = new Map<string, Enc[]>();
  E.forEach(e => { const k = pairKey(e); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(e); });
  const reincidentes = [...grupos.values()].filter(v => v.length > 1).sort((a, b) => b.length - a.length);
  const monitorados = r.pes.filter(p => !p.vit);
  const envolvidos = new Set(E.flatMap(e => ([[e.a, e.va], [e.b, e.vb]] as [number, boolean][]).filter(([, v]) => !v).map(([id]) => `${e.ds}:${id}`)));
  const hp = horasPessoa(r.dss, r.de, r.ate);
  return {
    total: E.length,
    pares: grupos.size,
    episodios: eps.length,
    duracaoMedia: eps.length ? sum(eps, x => x.dur) / eps.length : null,
    duracaoMax: eps.length ? Math.max(...eps.map(x => x.dur)) : null,
    proximos: E.filter(e => e.m < limite).length,
    horasPessoa: hp,
    taxa: hp ? (E.length / hp) * 1000 : null,
    monitorados: monitorados.length,
    monitoradosEnvolvidos: monitorados.filter(p => envolvidos.has(p.key)).length,
    reincidentes
  };
}

const execucoesDe = (dss: DsInfo[]): Execucao[] => dss.map(d => M.EXEC[d.n]).filter(Boolean);

/** Soma dos funis dos datasets do recorte. null quando nenhum tem funil gravado. */
export function funilDe(dss: DsInfo[]): Funil | null {
  const fs = execucoesDe(dss).map(x => x.funil).filter((f): f is Funil => !!f);
  if (!fs.length) return null;
  const chaves = Object.keys(fs[0]) as (keyof Funil)[];
  return Object.fromEntries(chaves.map(k => [k, sum(fs, f => f[k])])) as unknown as Funil;
}

export interface FalhaComDataset extends Falha { exemplos: (Falha['exemplos'][number] & { ds: number })[] }

/** Falhas de coleta somadas por tipo, com os exemplos marcados pelo dataset de origem. */
export function falhasDe(dss: DsInfo[]): { total: number; medidos: number; porTipo: Map<TipoFalha, FalhaComDataset> } {
  const porTipo = new Map<TipoFalha, FalhaComDataset>();
  const ex = execucoesDe(dss);
  let medidos = 0;
  for (const x of ex) {
    if (!x.falhas) continue;
    medidos++;
    for (const [tipo, f] of Object.entries(x.falhas) as [TipoFalha, Falha][]) {
      const acc = porTipo.get(tipo) ?? { total: 0, exemplos: [] };
      acc.total += f.total;
      acc.exemplos.push(...f.exemplos.map(e => ({ ...e, ds: x.dataset })));
      porTipo.set(tipo, acc);
    }
  }
  return { total: sum([...porTipo.values()], f => f.total), medidos, porTipo };
}
