/** Aba Vítimas: violações de medida protetiva, vítima a vítima. */
import { gradeCartoes, secao, vazio, type Cartao } from '../componentes/cartoes.js';
import { onEach } from '../nucleo/dom.js';
import { fmtDur, nf, nf1, pct, plural } from '../nucleo/formato.js';
import { acoes, filtros, ui } from '../nucleo/estado.js';
import { recorte } from '../nucleo/filtros.js';
import { estatVitimas } from '../nucleo/indicadores.js';
import type { DefAba } from './aba.js';

const LIMITE_LISTA_VITIMAS = 8;

function renderVitimas(el: HTMLElement): void {
  const r = recorte('todos');
  const s = estatVitimas(r);
  const abaixo = r.enc.filter(e => e.tipo === 'protetiva' && e.m < ui.lim).length;

  const cartoes: Cartao[] = [
    { id: 'v-viol', titulo: 'Violações de medida protetiva', valor: nf.format(s.violacoes),
      texto: 'Vezes em que o agressor ficou a menos de 20 m da vítima.', status: s.violacoes ? 'critico' : 'ok', rotuloStatus: s.violacoes ? 'Crítico' : 'Nenhuma',
      como: 'Encontros do tipo protetiva: uma pessoa tem medida protetiva e a outra está na lista de restrição dela.' },
    { id: 'v-af', titulo: 'Vítimas afetadas', valor: s.total ? `${s.afetadas}<small>/${s.total}</small>` : '–',
      texto: s.total ? `${pct(s.afetadas, s.total)}% das vítimas cadastradas no recorte.` : 'Nenhuma vítima neste recorte.', status: s.afetadas ? 'critico' : '' },
    { id: 'v-por', titulo: 'Violações por vítima afetada', valor: s.afetadas ? nf1.format(s.violacoes / s.afetadas) : '–',
      texto: s.afetadas ? `A vítima mais exposta teve ${plural(s.maxPorVitima, 'violação', 'violações')}.` : 'Sem violações.' },
    { id: 'v-agr', titulo: 'Agressores reincidentes', valor: s.agressores ? nf.format(s.agressoresReincidentes) : '–',
      texto: s.agressores ? `de ${plural(s.agressores, 'agressor', 'agressores')} com violação voltaram a se aproximar.` : 'Sem violações.',
      status: s.agressoresReincidentes ? 'atencao' : s.agressores ? 'ok' : '', rotuloStatus: s.agressoresReincidentes ? 'Atenção' : 'Nenhum',
      como: 'Agressores com mais de um episódio de violação. Leituras seguidas (a cada 5 s) contam como um episódio só.' },
    { id: 'v-min', titulo: 'Menor distância agressor–vítima', valor: s.menor == null ? '–' : `${nf1.format(s.menor)}<small>m</small>`,
      texto: s.violacoes ? `${plural(abaixo, 'violação ficou', 'violações ficaram')} abaixo de ${ui.lim} m.` : 'Sem violações.',
      status: abaixo ? 'critico' : '', rotuloStatus: 'Muito perto' },
    { id: 'v-t1', titulo: 'Tempo até a primeira violação', valor: s.primeiraMediana == null ? '–' : fmtDur(s.primeiraMediana),
      texto: s.primeiraMin == null ? 'Sem violações.' : `Mediana entre as vítimas afetadas. A mais rápida foi em ${fmtDur(s.primeiraMin)}.`,
      como: 'Tempo entre o início do monitoramento do dataset e a primeira violação de cada vítima; o cartão mostra a mediana.' }
  ];

  const mostrar = ui.vitimasTodas ? s.lista : s.lista.slice(0, LIMITE_LISTA_VITIMAS);
  const lista = mostrar.map((g, i) => {
    const ts = g.lista.map(e => e.ts).sort();
    return `<li><button type="button" class="item item-btn" id="v-item-${i}" data-ds="${g.ds}" data-id="${g.vit}">
      <span class="badge crit">${g.lista.length}×</span>
      <span class="item-t"><b>Vítima #${g.vit}</b> <span class="role">agressor #${[...g.agr].join(', #')} · D${g.ds}</span></span>
      <span class="item-d">${ts.length > 1 ? `${ts[0]} a ${ts[ts.length - 1].slice(11)}` : ts[0]}</span>
      <span class="item-v">${nf1.format(g.menor)} m<small>mais perto</small></span>
    </button></li>`;
  }).join('');

  el.innerHTML = `
    ${gradeCartoes(cartoes)}
    ${secao('Vítimas com violação', s.lista.length ? 'Ordenadas por número de violações e, depois, pela menor distância. Clique para ver os encontros.' : '',
      s.lista.length
        ? `<ul class="lista">${lista}</ul>${s.lista.length > LIMITE_LISTA_VITIMAS ? `<button type="button" class="btn" id="v-mais">${ui.vitimasTodas ? 'Mostrar menos' : `Mostrar todas as ${s.lista.length}`}</button>` : ''}`
        : vazio('Nenhuma violação de medida protetiva neste recorte.'))}`;

  onEach<HTMLButtonElement>(el, '.item-btn', b => {
    filtros.ds.clear();
    filtros.ds.add(Number(b.dataset.ds));
    filtros.tipos.clear();
    filtros.tipos.add('protetiva');
    ui.registros.view = 'enc';
    ui.registros.q = b.dataset.id ?? '';
    ui.registros.page = 1;
    acoes.irPara('registros');
  });
  const mais = document.getElementById('v-mais');
  if (mais) mais.onclick = () => { ui.vitimasTodas = !ui.vitimasTodas; acoes.renderizar(); };
}

export const abaVitimas: DefAba = {
  id: 'vitimas',
  titulo: 'Vítimas',
  escopo: 'todos',
  contador: () => {
    const n = recorte('todos').enc.filter(e => e.tipo === 'protetiva').length;
    return { texto: nf.format(n), alerta: n > 0 };
  },
  render: renderVitimas
};
