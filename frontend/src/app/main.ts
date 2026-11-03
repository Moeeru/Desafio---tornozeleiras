/**
 * Ponto de entrada do BI.
 * - HTML autocontido (npm run bi): os dados chegam embutidos em window.__DADOS__.
 * - Servidor local (npm run bi:serve): os dados vêm de GET /api/dados e podem ser atualizados.
 */
import type { DadosPainel } from '../../../shared/contrato.js';
import { abaBrutos } from './abas/brutos.js';
import { abaDesempenho } from './abas/desempenho.js';
import { abaEncontros } from './abas/encontros.js';
import { abaFaccoes } from './abas/faccoes.js';
import { abaIncluir } from './abas/incluir.js';
import { abaQualidade } from './abas/qualidade.js';
import { abaRegistros } from './abas/registros.js';
import { abaResumo } from './abas/resumo.js';
import { abaVitimas } from './abas/vitimas.js';
import type { DefAba } from './abas/aba.js';
import { carregarDadosPainel } from './nucleo/api.js';
import { $, hideTip } from './nucleo/dom.js';
import { esc, fmtDataHora } from './nucleo/formato.js';
import { M, montarModelo } from './nucleo/modelo.js';
import { acoes, aplicarHash, gravarHash, ui, type IdAba } from './nucleo/estado.js';
import { renderBarraFiltros } from './nucleo/filtros.js';

const ABAS: DefAba[] = [abaResumo, abaEncontros, abaVitimas, abaFaccoes, abaRegistros, abaBrutos, abaQualidade, abaDesempenho, abaIncluir];
const abaAtual = (): DefAba => ABAS.find(a => a.id === ui.aba) ?? ABAS[0];

/** A barra de filtros começa aberta em telas largas e lembra a escolha do usuário. */
let filtrosAbertos = typeof innerWidth === 'number' ? innerWidth > 900 : true;

function mensagem(html: string | null): void {
  const box = $('app-msg');
  box.hidden = !html;
  box.innerHTML = html ?? '';
}

function renderCabecalho(): void {
  const D = M.dados;
  const exec = D.execucao.map(r => r.executedAt).sort().pop();
  const partes = [`Dados de ${fmtDataHora(exec ?? D.geradoEm)}`];
  if (D.validacao) partes.push(`validação de ${fmtDataHora(D.validacao.executadoEm)}`);
  $('fresh').textContent = partes.join(' · ');
  $('btn-refresh').hidden = D.origem !== 'servidor';
  $('foot').innerHTML = `Radar de Encontros · ${M.DS.length} datasets · gerado a partir de <code>outputs/</code> e <code>metricas/</code>. ` +
    (D.origem === 'servidor' ? 'Use <b>Atualizar dados</b> depois de rodar <code>npm start</code> ou <code>npm test</code>.' : 'Gere de novo com <code>npm run bi</code>.');
  if (D.avisos.length) mensagem(`<b>Dados incompletos.</b><ul>${D.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`);
  else mensagem(null);
}

function renderNav(): void {
  const nav = $('abas');
  nav.innerHTML = ABAS.map(a => {
    const c = a.contador?.() ?? null;
    return `<button type="button" class="tab" role="tab" id="tab-${a.id}" data-aba="${a.id}" aria-selected="${ui.aba === a.id}" aria-controls="conteudo">
      ${a.titulo}${c ? ` <span class="ct${c.alerta ? ' alerta' : ''}">${esc(c.texto)}</span>` : ''}</button>`;
  }).join('');
  nav.querySelectorAll<HTMLButtonElement>('[data-aba]').forEach(b => { b.onclick = () => irPara(b.dataset.aba as IdAba); });
}

function renderizar(): void {
  hideTip();
  const aba = abaAtual();
  renderNav();
  renderBarraFiltros(aba.escopo, filtrosAbertos);
  const det = document.getElementById('f-det') as HTMLDetailsElement | null;
  if (det) det.ontoggle = () => { filtrosAbertos = det.open; };
  aba.render($('conteudo'));
  gravarHash();
}

function irPara(id: IdAba): void {
  ui.aba = id;
  renderizar();
  const nav = document.querySelector('.topo');
  if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: 'start' });
  $(`tab-${id}`).focus({ preventScroll: true });
}

async function recarregar(): Promise<void> {
  montarModelo(await carregarDadosPainel());
  renderCabecalho();
  renderizar();
}

async function atualizarPeloBotao(): Promise<void> {
  const btn = $<HTMLButtonElement>('btn-refresh');
  btn.disabled = true;
  btn.textContent = 'Atualizando…';
  try {
    await recarregar();
    btn.textContent = 'Atualizado';
  } catch (err) {
    mensagem(`<b>Não foi possível atualizar.</b> ${esc((err as Error).message)}`);
  } finally {
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Atualizar dados'; }, 1500);
  }
}

async function iniciar(): Promise<void> {
  Object.assign(acoes, { irPara, renderizar, recarregar });
  mensagem('Carregando dados…');
  let dados: DadosPainel;
  try {
    dados = await carregarDadosPainel();
  } catch (err) {
    mensagem(`<b>Não foi possível carregar os dados.</b> ${esc((err as Error).message)}<br>
      Confira se o servidor está rodando (<code>npm run bi:serve</code>) e se <code>npm start</code> já gerou <code>outputs/</code>.`);
    return;
  }
  montarModelo(dados);
  if (location.hash) aplicarHash(location.hash);
  renderCabecalho();
  renderizar();

  $('btn-refresh').addEventListener('click', () => { void atualizarPeloBotao(); });
  $('abas').addEventListener('keydown', ev => {
    const k = (ev as KeyboardEvent).key;
    if (k !== 'ArrowRight' && k !== 'ArrowLeft') return;
    const i = ABAS.findIndex(a => a.id === ui.aba);
    const prox = ABAS[(i + (k === 'ArrowRight' ? 1 : ABAS.length - 1)) % ABAS.length];
    irPara(prox.id);
  });
  window.addEventListener('hashchange', () => { aplicarHash(location.hash); renderizar(); });

  let ultimaLargura = 0, quadro = 0;
  new ResizeObserver(() => {
    const w = document.querySelector<HTMLElement>('.wrap')?.clientWidth ?? 0;
    if (Math.abs(w - ultimaLargura) < 4) return;
    ultimaLargura = w;
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => abaAtual().redimensionar?.());
  }).observe(document.querySelector('.wrap') as Element);
}

void iniciar();
