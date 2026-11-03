/** Aba Facções: encontros entre membros da mesma facção, em número e proporcional ao tamanho. */
import { gradeCartoes, secao, vazio, type Cartao } from '../componentes/cartoes.js';
import { barraHtml } from '../componentes/graficos.js';
import { onEach } from '../nucleo/dom.js';
import { esc, nf, nf2, pct, plural } from '../nucleo/formato.js';
import { acoes, filtros, ui } from '../nucleo/estado.js';
import { recorte } from '../nucleo/filtros.js';
import { estatFaccoes } from '../nucleo/indicadores.js';
import type { DefAba } from './aba.js';

function renderFaccoes(el: HTMLElement): void {
  const r = recorte('todos');
  const s = estatFaccoes(r);
  const porMembro = ui.rankMode === 'membro';

  const cartoes: Cartao[] = [
    { id: 'f-enc', titulo: 'Encontros entre membros', valor: nf.format(s.encontros),
      texto: `${pct(s.encontros, r.enc.length)}% de todos os encontros do recorte.`,
      como: 'Encontros entre dois monitorados com a mesma facção preenchida.' },
    { id: 'f-at', titulo: 'Facções ativas', valor: s.cadastradas ? `${s.ativas}<small>/${s.cadastradas}</small>` : '–',
      texto: s.cadastradas ? 'Facções com pelo menos um encontro entre membros.' : 'Nenhuma facção cadastrada no recorte.' },
    { id: 'f-pm', titulo: 'Encontros por membro', valor: s.totalMembros ? nf2.format(s.encontros / s.totalMembros) : '–',
      texto: s.totalMembros ? `${nf.format(s.totalMembros)} membros de facção no recorte.` : 'Nenhum membro de facção.',
      como: 'Encontros de facção ÷ número de monitorados que pertencem a alguma facção. Compara facções de tamanhos diferentes.' },
    { id: 'f-mem', titulo: 'Membros que se encontraram', valor: s.totalMembros ? `${pct(s.membrosQueSeEncontraram, s.totalMembros)}<small>%</small>` : '–',
      texto: s.totalMembros ? `${nf.format(s.membrosQueSeEncontraram)} de ${nf.format(s.totalMembros)} membros.` : 'Nenhum membro de facção.' },
    { id: 'f-lid', titulo: 'Facção com mais encontros', valor: s.encontros ? (s.empatadas > 1 ? 'Empate' : `Facção ${esc(s.lider)}`) : '–',
      texto: !s.encontros ? 'Sem encontros de facção.'
        : s.taxaUniforme != null ? `Lidera em número, mas todas têm ${nf2.format(s.taxaUniforme)} encontro por membro: a diferença vem só do tamanho.`
          : s.empatadas > 1 ? `${s.empatadas} facções com ${plural(s.nLider, 'encontro', 'encontros')} cada.`
            : `${s.nLider} de ${s.encontros} encontros de facção (${pct(s.nLider, s.encontros)}%).`,
      status: s.taxaUniforme != null ? '' : s.empatadas === 1 && s.encontros ? 'atencao' : '' }
  ];

  const lista = s.ranking.map(([f, n]) => [f, porMembro ? n / (s.membros.get(f) || 1) : n] as [string, number])
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
  const max = Math.max(0, ...lista.map(([, v]) => v));
  const barras = lista.map(([f, v]) => barraHtml(
    `<button type="button" class="link-mini" data-fac="${esc(f)}">Facção ${esc(f)}</button>`, v, max,
    porMembro ? `${nf2.format(v)} <small>${s.ranking.find(x => x[0] === f)?.[1]}/${s.membros.get(f) || 0}</small>` : `${v} <small>${pct(v, s.encontros)}%</small>`,
    'var(--s-faccao)'
  )).join('');
  const modo = `<div class="seg" role="group" aria-label="Medida do ranking">
      <button type="button" id="f-modo-total" aria-pressed="${!porMembro}">Total</button>
      <button type="button" id="f-modo-membro" aria-pressed="${porMembro}">Por membro</button>
    </div>`;

  el.innerHTML = `
    ${gradeCartoes(cartoes)}
    ${secao('Ranking de facções', porMembro ? 'Encontros entre membros ÷ número de membros. Clique numa facção para ver os encontros.' : 'Número de encontros entre membros. Clique numa facção para ver os encontros.',
      lista.length ? `<div class="ranking">${barras}</div>` : vazio('Nenhum encontro de facção neste recorte.'), modo)}
    ${r.dss.length > 1 ? '<p class="nota">Os números de facção foram somados entre datasets, supondo que o mesmo número indica a mesma facção.</p>' : ''}`;

  document.getElementById('f-modo-total')!.onclick = () => { ui.rankMode = 'total'; acoes.renderizar(); };
  document.getElementById('f-modo-membro')!.onclick = () => { ui.rankMode = 'membro'; acoes.renderizar(); };
  onEach<HTMLButtonElement>(el, '[data-fac]', b => {
    filtros.fac = b.dataset.fac ?? '';
    filtros.tipos.clear();
    filtros.tipos.add('faccao');
    ui.registros.view = 'enc';
    ui.registros.q = '';
    acoes.irPara('registros');
  });
}

export const abaFaccoes: DefAba = {
  id: 'faccoes',
  titulo: 'Facções',
  escopo: 'todos',
  render: renderFaccoes
};
