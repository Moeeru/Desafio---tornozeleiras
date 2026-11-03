/**
 * Estado da interface e sincronização com a URL (#vitimas?ds=7&tipo=protetiva), para que
 * qualquer recorte possa ser aberto de novo ou compartilhado por link.
 */
import type { TipoEncontro } from '../../../../shared/contrato.js';
import { M } from './modelo.js';

export type IdAba =
  | 'resumo' | 'encontros' | 'vitimas' | 'faccoes' | 'registros'
  | 'brutos' | 'qualidade' | 'desempenho' | 'incluir';
export type Papel = 'vitima' | 'faccao' | 'sem_faccao';
export type VisaoRegistros = 'enc' | 'pes' | 'map';
export interface Ordenacao { key: string; dir: 1 | -1 }

/** Filtros globais, aplicados a todas as abas de análise. */
export const filtros = {
  ds: new Set<number>(),
  /** Período em 'AAAA-MM-DDTHH:MM' (formato do <input type="datetime-local">). '' = sem limite. */
  de: '',
  ate: '',
  tipos: new Set<TipoEncontro>(),
  papeis: new Set<Papel>(),
  fac: ''
};

export const ui = {
  aba: 'resumo' as IdAba,
  /** Limite de "muito próximo", em metros. */
  lim: 10,
  vitimasTodas: false,
  rankMode: 'total' as 'total' | 'membro',
  registros: {
    view: 'enc' as VisaoRegistros,
    q: '',
    reinc: false,
    dmin: '',
    dmax: '',
    page: 1,
    size: 25,
    sort: { enc: { key: 'ts', dir: 1 } as Ordenacao, pes: { key: 'enc', dir: -1 } as Ordenacao }
  },
  /** Tabela de dados brutos. ds 0 = todos os datasets. */
  brutos: { ds: 0, pagina: 1, tamanho: 100 }
};

export function limparFiltros(): void {
  filtros.ds.clear();
  filtros.de = '';
  filtros.ate = '';
  filtros.tipos.clear();
  filtros.papeis.clear();
  filtros.fac = '';
}

/**
 * Ações registradas pelo main.ts. Os módulos chamam por aqui em vez de importar uns aos outros,
 * o que evita dependências circulares entre as abas.
 */
export const acoes = {
  irPara: (_aba: IdAba): void => {},
  renderizar: (): void => {},
  recarregar: async (): Promise<void> => {}
};

/* ---------- URL ---------- */
const ABAS_VALIDAS: IdAba[] = ['resumo', 'encontros', 'vitimas', 'faccoes', 'registros', 'brutos', 'qualidade', 'desempenho', 'incluir'];
const TIPOS_OK: TipoEncontro[] = ['generico', 'faccao', 'protetiva'];
const PAPEIS_OK: Papel[] = ['vitima', 'faccao', 'sem_faccao'];
const DATA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function estadoParaHash(): string {
  const p = new URLSearchParams();
  if (filtros.ds.size) p.set('ds', [...filtros.ds].sort((a, b) => a - b).join(','));
  if (filtros.de) p.set('de', filtros.de);
  if (filtros.ate) p.set('ate', filtros.ate);
  if (filtros.tipos.size) p.set('tipo', [...filtros.tipos].join(','));
  if (filtros.papeis.size) p.set('papel', [...filtros.papeis].join(','));
  if (filtros.fac) p.set('fac', filtros.fac);
  if (ui.lim !== 10) p.set('lim', String(ui.lim));
  const r = ui.registros;
  if (ui.aba === 'registros') {
    if (r.view !== 'enc') p.set('view', r.view);
    if (r.q) p.set('q', r.q);
    if (r.reinc) p.set('reinc', '1');
    if (r.dmin) p.set('dmin', r.dmin);
    if (r.dmax) p.set('dmax', r.dmax);
  }
  if (ui.aba === 'brutos') {
    if (ui.brutos.ds) p.set('bds', String(ui.brutos.ds));
    if (ui.brutos.pagina > 1) p.set('bp', String(ui.brutos.pagina));
    if (ui.brutos.tamanho !== 100) p.set('bt', String(ui.brutos.tamanho));
  }
  const q = p.toString();
  return `#${ui.aba}${q ? `?${q}` : ''}`;
}

/** Aplica um hash ao estado. Valores inválidos são ignorados. */
export function aplicarHash(hash: string): void {
  const [rota, query = ''] = hash.replace(/^#/, '').split('?');
  const p = new URLSearchParams(query);
  const dsValidos = new Set(M.DS.map(d => d.n));
  ui.aba = (ABAS_VALIDAS as string[]).includes(rota) ? (rota as IdAba) : 'resumo';

  limparFiltros();
  (p.get('ds') || '').split(',').map(Number).filter(n => dsValidos.has(n)).forEach(n => filtros.ds.add(n));
  filtros.de = DATA_RE.test(p.get('de') || '') ? (p.get('de') as string) : '';
  filtros.ate = DATA_RE.test(p.get('ate') || '') ? (p.get('ate') as string) : '';
  (p.get('tipo') || '').split(',').filter((t): t is TipoEncontro => (TIPOS_OK as string[]).includes(t)).forEach(t => filtros.tipos.add(t));
  (p.get('papel') || '').split(',').filter((t): t is Papel => (PAPEIS_OK as string[]).includes(t)).forEach(t => filtros.papeis.add(t));
  const fac = p.get('fac') || '';
  filtros.fac = M.FACS.includes(fac) ? fac : '';
  const lim = Number(p.get('lim'));
  ui.lim = lim >= 5 && lim <= 19 ? Math.round(lim) : 10;

  const r = ui.registros;
  const v = p.get('view');
  r.view = v === 'pes' || v === 'map' ? v : 'enc';
  r.q = (p.get('q') || '').replace(/[^\d]/g, '');
  r.reinc = p.get('reinc') === '1';
  const num = (s: string | null): string => (s && isFinite(Number(s)) ? s : '');
  r.dmin = num(p.get('dmin'));
  r.dmax = num(p.get('dmax'));
  r.page = 1;

  const bds = Number(p.get('bds'));
  ui.brutos.ds = dsValidos.has(bds) ? bds : 0;
  ui.brutos.pagina = Math.max(1, Math.floor(Number(p.get('bp')) || 1));
  const bt = Number(p.get('bt'));
  ui.brutos.tamanho = [50, 100, 200, 500].includes(bt) ? bt : 100;
}

/** Atualiza a URL sem criar entrada no histórico a cada clique. */
export function gravarHash(): void {
  const h = estadoParaHash();
  if (location.hash === h) return;
  try { history.replaceState(null, '', h); } catch { /* ambiente sem history (ex.: sandbox) */ }
}
