/** Aba Registros: todos os encontros e o cadastro de pessoas, em tabela, com mapa e cópia em CSV. */
import { miniTipos, larguraDe, svgOpen } from '../componentes/graficos.js';
import { ligarOrdenacao, ordenar, paginacaoHtml, paginar, tabelaHtml, type Coluna } from '../componentes/tabela.js';
import { STACK, TIPO, sw } from '../nucleo/constantes.js';
import { $, bindTips, onEach } from '../nucleo/dom.js';
import { esc, nf, nf1, nf2, nf5, plural } from '../nucleo/formato.js';
import { M, pairKey, porEmpilhamento, type Enc, type Pessoa } from '../nucleo/modelo.js';
import { acoes, filtros, gravarHash, ui, type VisaoRegistros } from '../nucleo/estado.js';
import { recorte } from '../nucleo/filtros.js';
import type { DefAba } from './aba.js';

const posTxt = (p: [number, number]): string => `${nf5.format(p[0])}, ${nf5.format(p[1])}`;
const pessoaBtn = (id: number, vit: boolean, ds: number): string =>
  `<button type="button" class="link-mini" data-pds="${ds}" data-pid="${id}" title="Ver cadastro de #${id}">#${id}</button>${vit ? ' <span class="pill vit">vítima</span>' : ''}`;

const COLS_ENC: Coluna<Enc>[] = [
  { k: 'ds', l: 'Dataset', v: e => e.ds, html: e => `<span class="mono">D${e.ds}</span>` },
  { k: 'ts', l: 'Instante', v: e => e.ds * 1e13 + e.t, html: e => `<span class="mono">${e.ts}</span>` },
  { k: 'tipo', l: 'Tipo', v: e => STACK.indexOf(e.tipo), html: e => `<span class="tag"><i style="background:${sw(e.tipo)}"></i>${TIPO[e.tipo].nome}</span>` },
  { k: 'a', l: 'Pessoa A', v: e => e.a, html: e => pessoaBtn(e.a, e.va, e.ds) },
  { k: 'b', l: 'Pessoa B', v: e => e.b, html: e => pessoaBtn(e.b, e.vb, e.ds) },
  { k: 'fac', l: 'Facção', v: e => Number(e.faccao) || 0, html: e => (e.faccao ? `<span class="pill">${esc(e.faccao)}</span>` : '<span class="role">–</span>') },
  { k: 'pa', l: 'Posição A', v: null, html: e => `<span class="mono">${posTxt(e.pa)}</span>` },
  { k: 'pb', l: 'Posição B', v: null, html: e => `<span class="mono">${posTxt(e.pb)}</span>` },
  { k: 'rep', l: 'Vezes do par', v: e => M.PAIRCOUNT[pairKey(e)], r: true, html: e => `<span class="mono">${M.PAIRCOUNT[pairKey(e)]}</span>` },
  { k: 'm', l: 'Distância', v: e => e.m, r: true, html: e =>
    `<span class="gauge"><span class="mono">${nf2.format(e.m)} m</span><span class="g" title="${nf1.format((e.m / 20) * 100)}% do limite"><span style="width:${((e.m / 20) * 100).toFixed(1)}%"></span></span></span>` }
];

const COLS_PES: Coluna<Pessoa>[] = [
  { k: 'ds', l: 'Dataset', v: p => p.ds, html: p => `<span class="mono">D${p.ds}</span>` },
  { k: 'id', l: 'Id', v: p => p.ds * 1e6 + p.id, html: p => `<span class="mono"><b>#${p.id}</b></span>` },
  { k: 'papel', l: 'Papel', v: p => (p.vit ? 1 : 0), html: p => (p.vit ? '<span class="pill vit">vítima</span>' : '<span class="pill">monitorado</span>') },
  { k: 'fac', l: 'Facção', v: p => Number(p.fac) || 0, html: p => (p.fac ? `<span class="pill">${esc(p.fac)}</span>` : '<span class="role">–</span>') },
  { k: 'rel', l: 'Medida protetiva', v: null, html: p => (p.vit
    ? `protegida contra ${p.restr.map(x => `#${x}`).join(', ')}`
    : p.restringidoPor.length ? `restrito por ${p.restringidoPor.map(v => `#${v}`).join(', ')}` : '<span class="role">–</span>') },
  { k: 'enc', l: 'Encontros', v: p => p.enc, r: true, html: p => (p.enc
    ? `<button type="button" class="link-mini" data-eds="${p.ds}" data-eid="${p.id}" title="Ver encontros de #${p.id}">${p.enc}</button>` : '<span class="mono">0</span>') },
  { k: 'tipos', l: 'Por tipo', v: null, html: p => (p.enc ? miniTipos(p.c) : '<span class="role">–</span>') },
  { k: 'minM', l: 'Menor distância', v: p => p.minM ?? 99, r: true, html: p => (p.minM != null ? `<span class="mono">${nf2.format(p.minM)} m</span>` : '–') },
  { k: 'first', l: 'Primeiro encontro', v: p => p.first || '~', html: p => (p.first ? `<span class="mono">${p.first}</span>` : '<span class="role">–</span>') }
];

function qBate(ids: number[]): boolean {
  const q = ui.registros.q.replace(/[#\s]/g, '');
  return !q || ids.some(id => String(id) === q);
}

function encontrosFiltrados(): Enc[] {
  const r = ui.registros;
  const dmin = r.dmin === '' ? -Infinity : Number(r.dmin);
  const dmax = r.dmax === '' ? Infinity : Number(r.dmax);
  return recorte('todos').enc.filter(e =>
    qBate([e.a, e.b]) && e.m >= dmin && e.m <= dmax && (!r.reinc || M.PAIRCOUNT[pairKey(e)] > 1));
}
const pessoasFiltradas = (): Pessoa[] => recorte('todos').pes.filter(p => qBate([p.id]));

/** Limites do mapa: a área dos encontros com 8% de folga e um passo "redondo" de grade. */
function enquadramento(rows: Enc[]): { LAT0: number; LAT1: number; LON0: number; LON1: number; passo: number } {
  const lats = rows.map(e => e.lat), lons = rows.map(e => e.lon);
  let LAT0 = lats.length ? Math.min(...lats) : -1, LAT1 = lats.length ? Math.max(...lats) : 1;
  let LON0 = lons.length ? Math.min(...lons) : -1, LON1 = lons.length ? Math.max(...lons) : 1;
  const span = Math.max(LAT1 - LAT0, LON1 - LON0, 0.01);
  const folga = span * 0.08;
  // Área quadrada em torno do centro, para o mapa não ficar achatado com um só ponto ou uma linha
  const cLat = (LAT0 + LAT1) / 2, cLon = (LON0 + LON1) / 2, meio = span / 2 + folga;
  LAT0 = Math.max(-90, cLat - meio); LAT1 = Math.min(90, cLat + meio);
  LON0 = Math.max(-180, cLon - meio); LON1 = Math.min(180, cLon + meio);
  const bruto = (2 * meio) / 4, ordem = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map(f => f * ordem).find(p => p >= bruto) ?? 10 * ordem;
  return { LAT0, LAT1, LON0, LON1, passo };
}

function desenharMapaRegistros(rows: Enc[]): void {
  const el = document.getElementById('g-mapa');
  if (!el) return;
  const W0 = larguraDe(el);
  if (!W0) return;
  const W = W0 - 24;
  // Enquadramento calculado a partir dos próprios encontros (com folga), em vez de uma região fixa
  const { LAT0, LAT1, LON0, LON1, passo } = enquadramento(rows);
  const k = Math.cos((((LAT0 + LAT1) / 2) * Math.PI) / 180);
  const m = { l: 44, r: 10, t: 10, b: 24 }, iw = W - m.l - m.r;
  const ih = Math.min(560, (iw * (LAT1 - LAT0)) / ((LON1 - LON0) * k)), H = ih + m.t + m.b;
  const x = (lon: number): number => m.l + ((lon - LON0) / (LON1 - LON0)) * iw;
  const y = (lat: number): number => m.t + ((LAT1 - lat) / (LAT1 - LAT0)) * ih;
  const casas = passo >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(passo)));
  const grau = (v: number, pos: string, neg: string): string =>
    Math.abs(v) < passo / 2 ? '0°' : `${Math.abs(v).toFixed(casas).replace('.', ',')}°${v < 0 ? neg : pos}`;
  let s = svgOpen(W, H, `Mapa com ${rows.length} encontros`);
  for (let lat = Math.ceil(LAT0 / passo) * passo; lat <= LAT1; lat += passo) {
    s += `<line class="grid-l" x1="${m.l}" x2="${W - m.r}" y1="${y(lat)}" y2="${y(lat)}"/>`;
    s += `<text class="ax" x="${m.l - 6}" y="${y(lat) + 4}" text-anchor="end">${grau(lat, 'N', 'S')}</text>`;
  }
  for (let lon = Math.ceil(LON0 / passo) * passo; lon <= LON1; lon += passo) {
    s += `<line class="grid-l" y1="${m.t}" y2="${m.t + ih}" x1="${x(lon)}" x2="${x(lon)}"/>`;
    s += `<text class="ax" x="${x(lon)}" y="${H - 6}" text-anchor="middle">${grau(lon, 'L', 'O')}</text>`;
  }
  const ordem = [...rows].sort(porEmpilhamento);
  ordem.forEach(e => { s += `<circle class="m-${e.tipo} ring" cx="${x(e.lon).toFixed(1)}" cy="${y(e.lat).toFixed(1)}" r="5"/>`; });
  ordem.forEach(e => { s += `<circle class="hit" data-tip="${e.key}" cx="${x(e.lon).toFixed(1)}" cy="${y(e.lat).toFixed(1)}" r="11"/>`; });
  el.innerHTML = rows.length ? `${s}</svg>` : '<p class="vazio">Nenhum encontro com esses filtros.</p>';
  bindTips(el, key => {
    const e = M.BYKEY[key];
    if (!e) return '';
    const quem = e.tipo === 'protetiva'
      ? `Agressor <b>#${e.agr}</b> perto da vítima <b>#${e.vit}</b>`
      : `Pessoas <b>#${e.a}</b> e <b>#${e.b}</b>${e.faccao ? `, facção ${esc(e.faccao)}` : ''}`;
    return `<div class="tt">${TIPO[e.tipo].nome} · dataset ${e.ds}</div>${quem}<br>${e.ts}<br><b>${nf1.format(e.m)} m</b> de distância`;
  });
}

async function copiarCsv(rows: { enc: Enc[] } | { pes: Pessoa[] }): Promise<void> {
  const q = (v: unknown): string => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas: unknown[][] = 'pes' in rows
    ? [['dataset', 'id', 'papel', 'faccao', 'protegida_contra', 'restrito_por', 'encontros', 'generico', 'faccao_enc', 'protetiva', 'menor_distancia_m', 'primeiro_encontro'],
      ...rows.pes.map(p => [p.ds, p.id, p.vit ? 'vitima' : 'monitorado', p.fac, p.restr.join(','), p.restringidoPor.join(','),
        p.enc, p.c.generico, p.c.faccao, p.c.protetiva, p.minM ?? '', p.first])]
    : [['dataset', 'timestamp', 'tipo', 'pessoa_a', 'pessoa_b', 'faccao', 'lat_a', 'lon_a', 'lat_b', 'lon_b', 'vezes_do_par', 'distancia_m'],
      ...rows.enc.map(e => [e.ds, e.ts, e.tipo, e.a, e.b, e.faccao, e.pa[0], e.pa[1], e.pb[0], e.pb[1], M.PAIRCOUNT[pairKey(e)], e.m])];
  const aviso = document.getElementById('g-toast');
  try {
    await navigator.clipboard.writeText(linhas.map(l => l.map(q).join(';')).join('\n'));
    if (aviso) aviso.textContent = `CSV copiado: ${plural(linhas.length - 1, 'linha', 'linhas')}, separado por ponto e vírgula.`;
  } catch {
    if (aviso) aviso.textContent = 'O navegador bloqueou a área de transferência. Abra o BI pelo servidor (npm run bi:serve) e tente de novo.';
  }
  setTimeout(() => { if (aviso) aviso.textContent = ''; }, 5000);
}

function renderRegistros(el: HTMLElement): void {
  const st = ui.registros;
  const isPes = st.view === 'pes';
  const enc = isPes ? [] : ordenar(encontrosFiltrados(), COLS_ENC, st.sort.enc);
  const pes = isPes ? ordenar(pessoasFiltradas(), COLS_PES, st.sort.pes) : [];
  const total = isPes ? pes.length : enc.length;
  const pagina = paginar<Enc | Pessoa>(isPes ? pes : enc, st.page, st.size);
  st.page = pagina.pagina;

  const views: [VisaoRegistros, string][] = [['enc', 'Encontros'], ['pes', 'Pessoas'], ['map', 'Mapa']];
  const locais = `<div class="locais">
      <label class="sr" for="g-q">Buscar por id</label>
      <input class="field" id="g-q" type="search" inputmode="numeric" placeholder="Buscar id, ex.: 10" value="${esc(st.q)}" autocomplete="off">
      ${isPes ? '' : `<span class="faixa"><label for="g-dmin">Distância</label>
        <input class="field num" id="g-dmin" type="number" min="0" max="20" step="0.5" placeholder="0" value="${st.dmin}" aria-label="Distância mínima em metros">
        <span>a</span>
        <input class="field num" id="g-dmax" type="number" min="0" max="20" step="0.5" placeholder="20" value="${st.dmax}" aria-label="Distância máxima em metros"> m</span>
      <label class="check"><input type="checkbox" id="g-reinc"${st.reinc ? ' checked' : ''}> Só pares que se repetem</label>`}
    </div>`;

  let corpo = '';
  if (st.view === 'enc') corpo = tabelaHtml('g-enc', COLS_ENC, pagina.itens as Enc[], st.sort.enc, 'Nenhum encontro com esses filtros. Remova algum filtro acima.');
  else if (st.view === 'pes') corpo = tabelaHtml('g-pes', COLS_PES, pagina.itens as Pessoa[], st.sort.pes, 'Nenhuma pessoa com esses filtros. Remova algum filtro acima.');
  else corpo = '<div class="painel chart" id="g-mapa"></div><p class="nota">Ponto médio de cada encontro. As coordenadas são sintéticas e chegam a cair no oceano, por isso não há contorno de país.</p>';

  el.innerHTML = `
    <div class="barra-reg">
      <div class="seg" role="group" aria-label="Visualização">${views.map(([v, l]) =>
        `<button type="button" id="g-v-${v}" data-v="${v}" aria-pressed="${st.view === v}">${l}</button>`).join('')}</div>
      ${locais}
    </div>
    <div class="barra-reg">
      <span class="count"><b>${nf.format(st.view === 'map' ? enc.length || encontrosFiltrados().length : total)}</b> ${isPes ? 'pessoas' : 'encontros'}</span>
      <span class="acoes-reg"><button type="button" class="btn" id="g-csv"${total && st.view !== 'map' ? '' : ' disabled'}>Copiar CSV</button><span class="toast" id="g-toast" role="status"></span></span>
    </div>
    ${corpo}
    ${st.view === 'map' ? '' : paginacaoHtml('g-pg', pagina, total, st.size)}`;

  // Visão e filtros locais
  onEach<HTMLButtonElement>(el, '[id^="g-v-"]', b => { st.view = b.dataset.v as VisaoRegistros; st.page = 1; acoes.renderizar(); });
  const reler = (): void => { st.page = 1; acoes.renderizar(); };
  const q = $<HTMLInputElement>('g-q');
  q.oninput = () => {
    st.q = q.value.trim();
    reler();
    const novo = document.getElementById('g-q') as HTMLInputElement | null; // a aba foi redesenhada: devolve o foco
    if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
  };
  if (!isPes) {
    $<HTMLInputElement>('g-dmin').onchange = ev => { st.dmin = (ev.target as HTMLInputElement).value; reler(); };
    $<HTMLInputElement>('g-dmax').onchange = ev => { st.dmax = (ev.target as HTMLInputElement).value; reler(); };
    $<HTMLInputElement>('g-reinc').onchange = ev => { st.reinc = (ev.target as HTMLInputElement).checked; reler(); };
  }
  $('g-csv').onclick = () => { void copiarCsv(isPes ? { pes } : { enc }); };

  if (st.view === 'map') { desenharMapaRegistros(encontrosFiltrados()); gravarHash(); return; }

  // Ordenação e paginação
  if (st.view === 'enc') ligarOrdenacao(el, 'g-enc', st.sort.enc, s => { st.sort.enc = s; reler(); }, ['rep']);
  else ligarOrdenacao(el, 'g-pes', st.sort.pes, s => { st.sort.pes = s; reler(); }, ['enc']);
  $<HTMLSelectElement>('g-pg-size').onchange = ev => { st.size = Number((ev.target as HTMLSelectElement).value); reler(); };
  $('g-pg-prev').onclick = () => { st.page--; acoes.renderizar(); };
  $('g-pg-next').onclick = () => { st.page++; acoes.renderizar(); };

  // Navegação entre encontro e pessoa
  onEach<HTMLButtonElement>(el, '[data-pid]', b => {
    filtros.ds.clear();
    filtros.ds.add(Number(b.dataset.pds));
    st.view = 'pes';
    st.q = b.dataset.pid ?? '';
    st.page = 1;
    acoes.renderizar();
  });
  onEach<HTMLButtonElement>(el, '[data-eid]', b => {
    filtros.ds.clear();
    filtros.ds.add(Number(b.dataset.eds));
    st.view = 'enc';
    st.q = b.dataset.eid ?? '';
    st.page = 1;
    acoes.renderizar();
  });
}

export const abaRegistros: DefAba = {
  id: 'registros',
  titulo: 'Registros',
  escopo: 'todos',
  render: renderRegistros,
  redimensionar: () => { if (ui.registros.view === 'map') desenharMapaRegistros(encontrosFiltrados()); }
};
