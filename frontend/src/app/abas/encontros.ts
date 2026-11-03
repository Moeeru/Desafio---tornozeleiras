/** Aba Encontros: volume, duração, proximidade e repetição dos encontros. */
import { gradeCartoes, secao, vazio, type Cartao } from '../componentes/cartoes.js';
import { desenharBarras, desenharFaixas, legendaHtml } from '../componentes/graficos.js';
import { TIPO, TIPOS, sw } from '../nucleo/constantes.js';
import { $ } from '../nucleo/dom.js';
import { compact, fmtDur, nf, nf1, pct, plural } from '../nucleo/formato.js';
import { intervaloTxt, limiteTxt, M, P } from '../nucleo/modelo.js';
import { acoes, filtros, gravarHash, ui } from '../nucleo/estado.js';
import { recorte } from '../nucleo/filtros.js';
import { contagemTipos, estatEncontros } from '../nucleo/indicadores.js';
import type { DefAba } from './aba.js';

/** O "muito próximo" vai de 1 m até 1 m abaixo da distância limite da configuração. */
const tetoLim = (): number => Math.max(1, Math.ceil(P().distanciaLimiteMetros) - 1);

function cartoesEncontros(): Cartao[] {
  if (ui.lim > tetoLim()) ui.lim = tetoLim();
  const r = recorte('todos');
  const s = estatEncontros(r, ui.lim);
  return [
    { id: 'e-total', titulo: 'Encontros', valor: nf.format(s.total), texto: `${plural(s.pares, 'par diferente', 'pares diferentes')} de pessoas.`,
      como: `Um registro por par de pessoas a menos de ${limiteTxt()} em cada instante (regra de pontuação do desafio).` },
    { id: 'e-eps', titulo: 'Episódios', valor: nf.format(s.episodios),
      texto: s.total > s.episodios ? `${plural(s.total - s.episodios, 'leitura seguida agrupada', 'leituras seguidas agrupadas')} ao mesmo episódio.` : 'Nenhum par ficou próximo em leituras seguidas.',
      como: `Leituras seguidas (a cada ${intervaloTxt()}) do mesmo par contam como um único episódio de aproximação.` },
    { id: 'e-dur', titulo: 'Duração média do episódio', valor: s.duracaoMedia == null ? '–' : `${nf1.format(s.duracaoMedia)}<small>s</small>`,
      texto: s.duracaoMax == null ? 'Sem encontros.' : `O mais longo durou ${fmtDur(s.duracaoMax)}.`,
      como: `Último instante − primeiro instante do episódio + ${intervaloTxt()} (cada leitura vale ${intervaloTxt()}).` },
    { id: 'e-prox', titulo: `Muito próximos (menos de ${ui.lim} m)`, valor: s.total ? `${pct(s.proximos, s.total)}<small>%</small>` : '–',
      texto: `${plural(s.proximos, 'encontro', 'encontros')} de ${nf.format(s.total)}. Ajuste o limite no controle abaixo.`,
      como: 'Encontros com distância abaixo do limite escolhido ÷ total de encontros.' },
    { id: 'e-taxa', titulo: 'Encontros por 1.000 horas-pessoa', valor: s.taxa == null ? '–' : nf1.format(s.taxa),
      texto: `Em ${compact(s.horasPessoa)} horas-pessoa monitoradas. Deixa datasets de tamanhos diferentes comparáveis.`,
      como: 'Encontros ÷ (pessoas × horas monitoradas) × 1.000. Com filtro de período, conta só as horas dentro dele.' },
    { id: 'e-mon', titulo: 'Monitorados envolvidos', valor: s.monitorados ? `${s.monitoradosEnvolvidos}<small>/${s.monitorados}</small>` : '–',
      texto: s.monitorados ? `${pct(s.monitoradosEnvolvidos, s.monitorados)}% dos monitorados tiveram algum encontro.` : 'Nenhum monitorado neste recorte.',
      como: 'Monitorados (sem contar vítimas) com pelo menos um encontro ÷ total de monitorados.' }
  ];
}

function desenharGraficosEncontros(): void {
  const r = recorte('todos');
  const linhas = M.DS.map(d => {
    const E = r.enc.filter(e => e.ds === d.n);
    const ex = M.EXEC[d.n];
    return { n: d.n, c: contagemTipos(E), total: E.length, extra: ex ? `<br>${compact(ex.records)} posições lidas` : '' };
  });
  const bars = document.getElementById('e-bars');
  if (bars) desenharBarras(bars, linhas, filtros.ds, n => {
    if (filtros.ds.size === 1 && filtros.ds.has(n)) filtros.ds.clear(); else { filtros.ds.clear(); filtros.ds.add(n); }
    acoes.renderizar();
  });
  const dist = document.getElementById('e-dist');
  if (dist) desenharFaixas(dist, r.enc, P().distanciaLimiteMetros);
}

function renderEncontros(el: HTMLElement): void {
  if (ui.lim > tetoLim()) ui.lim = tetoLim();
  const r = recorte('todos');
  const s = estatEncontros(r, ui.lim);
  const rep = s.reincidentes.slice(0, 8).map(v => {
    const e = v[0];
    const span = (v[v.length - 1].t - v[0].t) / 1000, seguidas = span === (v.length - 1) * P().intervaloLeituraSegundos;
    return `<li class="item">
      <span class="badge" style="background:${sw(e.tipo)}">${v.length}×</span>
      <span class="item-t"><b>#${e.a} e #${e.b}</b> <span class="role">D${e.ds} · ${TIPO[e.tipo].nome}</span></span>
      <span class="item-d">${seguidas ? `${v.length} leituras seguidas (${fmtDur(span)})` : `ao longo de ${fmtDur(span)}`}</span>
    </li>`;
  }).join('');

  el.innerHTML = `
    ${gradeCartoes(cartoesEncontros())}
    <div class="ferramenta">
      <label for="e-lim">Considerar "muito próximo" abaixo de <b id="e-lim-v">${ui.lim} m</b></label>
      <input type="range" id="e-lim" min="1" max="${tetoLim()}" step="1" value="${ui.lim}">
    </div>
    <div class="duas">
      ${secao('Encontros por dataset', 'Clique numa coluna para filtrar o painel por aquele dataset.', '<div class="chart" id="e-bars"></div>', legendaHtml(TIPOS.map(t => t.k)))}
      ${secao('A que distância se encontram', 'Faixa do menor ao maior valor; a parte forte é a metade central e o ponto é a mediana.', '<div class="chart" id="e-dist"></div>')}
    </div>
    ${secao('Pares que se encontraram mais de uma vez', s.reincidentes.length ? `${plural(s.reincidentes.length, 'par', 'pares')} de ${nf.format(s.pares)}.` : '',
      s.reincidentes.length ? `<ul class="lista">${rep}</ul>` : vazio('Nenhum par se encontrou mais de uma vez neste recorte.'))}`;

  $<HTMLInputElement>('e-lim').oninput = ev => {
    ui.lim = Number((ev.target as HTMLInputElement).value);
    $('e-lim-v').textContent = `${ui.lim} m`;
    const novos = cartoesEncontros().find(c => c.id === 'e-prox');
    const card = document.getElementById('k-e-prox');
    if (novos && card) {
      card.querySelector('h3')!.textContent = novos.titulo;
      card.querySelector('.kval')!.innerHTML = novos.valor;
      card.querySelector('.ktxt')!.innerHTML = novos.texto;
    }
    gravarHash();
  };
  desenharGraficosEncontros();
}

export const abaEncontros: DefAba = {
  id: 'encontros',
  titulo: 'Encontros',
  escopo: 'todos',
  contador: () => ({ texto: nf.format(recorte('todos').enc.length) }),
  render: renderEncontros,
  redimensionar: desenharGraficosEncontros
};
