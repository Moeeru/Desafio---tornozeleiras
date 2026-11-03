/** Filtros globais: o recorte de dados que cada aba recebe e a barra de filtros. */
import { TIPOS, sw } from './constantes.js';
import { $ } from './dom.js';
import { esc, nf, plural } from './formato.js';
import { M, type DsInfo, type Enc, type Pessoa } from './modelo.js';
import { acoes, filtros, limparFiltros, type Papel } from './estado.js';

export type EscopoFiltros = 'todos' | 'dataset' | 'nenhum';

export interface Recorte {
  dss: DsInfo[];
  enc: Enc[];
  pes: Pessoa[];
  /** Período em ms UTC (null = sem limite). */
  de: number | null;
  ate: number | null;
}

export const PAPEIS: { k: Papel; nome: string; desc: string }[] = [
  { k: 'vitima', nome: 'Vítimas', desc: 'pessoas com medida protetiva' },
  { k: 'faccao', nome: 'Membros de facção', desc: 'monitorados com facção' },
  { k: 'sem_faccao', nome: 'Sem facção', desc: 'monitorados sem facção' }
];

export const papelDe = (fac: string, vit: boolean): Papel => (vit ? 'vitima' : fac ? 'faccao' : 'sem_faccao');

/** 'AAAA-MM-DDTHH:MM' (sem fuso, como os timestamps dos dados) -> ms UTC. */
function localParaMs(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}
const msParaLocal = (ms: number): string => new Date(ms).toISOString().slice(0, 16);

/** Datasets, encontros e pessoas que passam pelos filtros. Com escopo 'dataset', só o dataset vale. */
export function recorte(escopo: EscopoFiltros = 'todos'): Recorte {
  const dss = filtros.ds.size ? M.DS.filter(d => filtros.ds.has(d.n)) : M.DS;
  const noDs = new Set(dss.map(d => d.n));
  if (escopo !== 'todos') {
    return { dss, enc: M.ENC.filter(e => noDs.has(e.ds)), pes: M.PES.filter(p => noDs.has(p.ds)), de: null, ate: null };
  }
  const de = localParaMs(filtros.de);
  // "até 10:30" inclui o minuto 10:30 inteiro
  const ateIni = localParaMs(filtros.ate);
  const ate = ateIni == null ? null : ateIni + 59_999;
  const enc = M.ENC.filter(e =>
    noDs.has(e.ds) &&
    (de == null || e.t >= de) &&
    (ate == null || e.t <= ate) &&
    (!filtros.tipos.size || filtros.tipos.has(e.tipo)) &&
    (!filtros.papeis.size || filtros.papeis.has(papelDe(e.fa, e.va)) || filtros.papeis.has(papelDe(e.fb, e.vb))) &&
    (!filtros.fac || e.fa === filtros.fac || e.fb === filtros.fac));
  const pes = M.PES.filter(p =>
    noDs.has(p.ds) &&
    (!filtros.papeis.size || filtros.papeis.has(papelDe(p.fac, p.vit))) &&
    (!filtros.fac || p.fac === filtros.fac));
  return { dss, enc, pes, de, ate };
}

export function contarFiltrosAtivos(escopo: EscopoFiltros): number {
  if (escopo === 'nenhum') return 0;
  const n = filtros.ds.size ? 1 : 0;
  if (escopo === 'dataset') return n;
  return n + (filtros.de || filtros.ate ? 1 : 0) + (filtros.tipos.size ? 1 : 0) + (filtros.papeis.size ? 1 : 0) + (filtros.fac ? 1 : 0);
}

function alternar<T>(s: Set<T>, v: T): void {
  if (s.has(v)) s.delete(v); else s.add(v);
}

/** Desenha a barra de filtros mostrando só os filtros que a aba atual usa. */
export function renderBarraFiltros(escopo: EscopoFiltros, aberta: boolean): void {
  const el = $('filtros');
  el.hidden = escopo === 'nenhum';
  if (escopo === 'nenhum') return;

  const ativos = contarFiltrosAtivos(escopo);
  const r = recorte(escopo);
  const iniMin = Math.min(...M.DS.filter(d => d.temCadastro).map(d => d.ini));
  const fimMax = Math.max(...M.DS.filter(d => d.temCadastro).map(d => d.fim));
  const temPeriodo = isFinite(iniMin) && isFinite(fimMax);

  const chip = (id: string, ativo: boolean, rotulo: string, cor?: string, titulo?: string): string =>
    `<button type="button" class="chip" id="${id}" aria-pressed="${ativo}"${titulo ? ` title="${esc(titulo)}"` : ''}>${cor ? `<i style="background:${cor}"></i>` : ''}${rotulo}</button>`;

  const grupoDs = `<div class="fgrp"><span class="flab">Dataset</span><div class="chips">
      ${chip('f-ds-todos', !filtros.ds.size, 'Todos')}
      ${M.DS.map(d => chip(`f-ds-${d.n}`, filtros.ds.has(d.n), `D${d.n}`, undefined, d.oficial ? 'dataset oficial' : 'dataset incluído')).join('')}
    </div></div>`;

  const completos = escopo === 'todos' ? `
    ${temPeriodo ? `<div class="fgrp"><span class="flab">Período</span><div class="periodo">
      <label class="sr" for="f-de">De</label>
      <input type="datetime-local" class="field" id="f-de" value="${filtros.de}" min="${msParaLocal(iniMin)}" max="${msParaLocal(fimMax)}">
      <span aria-hidden="true">até</span>
      <label class="sr" for="f-ate">Até</label>
      <input type="datetime-local" class="field" id="f-ate" value="${filtros.ate}" min="${msParaLocal(iniMin)}" max="${msParaLocal(fimMax)}">
    </div></div>` : ''}
    <div class="fgrp"><span class="flab">Tipo de encontro</span><div class="chips">
      ${TIPOS.map(t => chip(`f-tipo-${t.k}`, filtros.tipos.has(t.k), t.nome, sw(t.k), t.desc)).join('')}
    </div></div>
    <div class="fgrp"><span class="flab">Tipo de pessoa</span><div class="chips">
      ${PAPEIS.map(p => chip(`f-papel-${p.k}`, filtros.papeis.has(p.k), p.nome, undefined, p.desc)).join('')}
    </div></div>
    <div class="fgrp"><label class="flab" for="f-fac">Facção</label>
      <select class="field" id="f-fac"><option value="">Todas</option>${M.FACS.map(f =>
        `<option value="${esc(f)}"${filtros.fac === f ? ' selected' : ''}>Facção ${esc(f)}</option>`).join('')}</select>
    </div>` : '';

  const resumo = escopo === 'todos'
    ? `${plural(r.enc.length, 'encontro', 'encontros')} de ${nf.format(M.ENC.length)}`
    : `${plural(r.dss.length, 'dataset', 'datasets')} de ${M.DS.length}`;

  el.innerHTML = `<details class="fbar" id="f-det"${aberta ? ' open' : ''}>
      <summary><span class="ftit">Filtros${ativos ? ` <b class="fcount">${ativos}</b>` : ''}</span><span class="fres">${resumo}</span></summary>
      <div class="fbody">
        ${grupoDs}${completos}
        <div class="fgrp fend">
          ${escopo === 'dataset' ? '<span class="hint">Esta aba usa só o filtro de dataset.</span>' : ''}
          <button type="button" class="btn" id="f-limpar"${ativos ? '' : ' disabled'}>Limpar filtros</button>
        </div>
      </div>
    </details>`;

  const mudou = (): void => acoes.renderizar();
  $('f-ds-todos').onclick = () => { filtros.ds.clear(); mudou(); };
  M.DS.forEach(d => { $(`f-ds-${d.n}`).onclick = () => { alternar(filtros.ds, d.n); mudou(); }; });
  if (escopo === 'todos') {
    TIPOS.forEach(t => { $(`f-tipo-${t.k}`).onclick = () => { alternar(filtros.tipos, t.k); mudou(); }; });
    PAPEIS.forEach(p => { $(`f-papel-${p.k}`).onclick = () => { alternar(filtros.papeis, p.k); mudou(); }; });
    $<HTMLSelectElement>('f-fac').onchange = ev => { filtros.fac = (ev.target as HTMLSelectElement).value; mudou(); };
    if (temPeriodo) {
      $<HTMLInputElement>('f-de').onchange = ev => { filtros.de = (ev.target as HTMLInputElement).value; mudou(); };
      $<HTMLInputElement>('f-ate').onchange = ev => { filtros.ate = (ev.target as HTMLInputElement).value; mudou(); };
    }
  }
  $('f-limpar').onclick = () => { limparFiltros(); mudou(); };
}

/** Descrição curta do recorte, para títulos e mensagens ("nos 7 datasets", "no dataset 3"). */
export function descreverRecorte(r: Recorte): string {
  if (r.dss.length === M.DS.length) return `nos ${M.DS.length} datasets`;
  if (r.dss.length === 1) return `no dataset ${r.dss[0].n}`;
  return `nos datasets ${r.dss.map(d => d.n).join(', ')}`;
}
