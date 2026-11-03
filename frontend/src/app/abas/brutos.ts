/**
 * Aba Dados brutos: uma única tabela com todas as linhas de todos os arquivos, em ordem, cada uma
 * com o tratamento que recebeu e a distância até a pessoa mais próxima no mesmo instante.
 * Opcionalmente, mostra só um dataset. Precisa do servidor: são milhões de linhas, entregues
 * uma página por vez pelo backend.
 */
import type { PaginaBrutos, RegistroBruto } from '../../../../shared/contrato.js';
import { secao } from '../componentes/cartoes.js';
import { TIPO, sw } from '../nucleo/constantes.js';
import { buscarPaginaBrutos } from '../nucleo/api.js';
import { $ } from '../nucleo/dom.js';
import { esc, nf, nf1, nf5 } from '../nucleo/formato.js';
import { limiteTxt, M, nomeDs, P } from '../nucleo/modelo.js';
import { acoes, gravarHash, ui } from '../nucleo/estado.js';
import type { DefAba } from './aba.js';

let paginaBrutos: PaginaBrutos | null = null;
let chaveBrutos = '';
let carregandoPagina = false;
let erroPagina = '';

const chaveDaTela = (): string => `${ui.brutos.ds}|${ui.brutos.pagina}|${ui.brutos.tamanho}`;

async function carregarPagina(): Promise<void> {
  const chave = chaveDaTela();
  carregandoPagina = true;
  erroPagina = '';
  try {
    const r = await buscarPaginaBrutos(ui.brutos.ds, ui.brutos.pagina, ui.brutos.tamanho);
    if (chave !== chaveDaTela()) return; // o usuário já pediu outra página
    paginaBrutos = r;
    ui.brutos.pagina = r.pagina;
    chaveBrutos = chaveDaTela();
  } catch (e) {
    erroPagina = (e as Error).message;
    chaveBrutos = chave;
  } finally {
    carregandoPagina = false;
    if (ui.aba === 'brutos') acoes.renderizar();
  }
}

const metros = (d: number): string => (d < 1000 ? `${nf1.format(d)} m` : `${nf1.format(d / 1000)} km`);

function tratamentoHtml(r: RegistroBruto): string {
  if (r.status === 'descartado') return `<span class="pill erro">descartado</span> <span class="role">${esc(r.motivo ?? '')}</span>`;
  if (r.encontros) return `<span class="pill ok">em ${r.encontros === 1 ? '1 encontro' : `${r.encontros} encontros`}</span>`;
  if (r.candidatos) return '<span class="pill">passou o pré-filtro</span>';
  return '<span class="role">válido, ninguém a menos de ~25 m</span>';
}

function paresHtml(r: RegistroBruto): string {
  if (!r.paresCom?.length) return '<span class="role">–</span>';
  return r.paresCom.map(p => {
    const resultado = p.etapa === 'encontro' && p.tipo
      ? `<span class="tag"><i style="background:${sw(p.tipo)}"></i>encontro ${TIPO[p.tipo].nome.toLowerCase()}</span>`
      : p.etapa === 'ignorado_vitima' ? '<span class="role">descartado: vítima sem relação</span>' : `<span class="role">${limiteTxt()} ou mais</span>`;
    return `<span class="par-bruto"><span class="mono">#${p.id} · ${metros(p.distancia)}</span> ${resultado}</span>`;
  }).join('');
}

function papelHtml(r: RegistroBruto): string {
  if (r.status !== 'valido') return '';
  if (r.vitima) return '<span class="pill vit">vítima</span>';
  return r.faccao ? `<span class="pill">facção ${esc(r.faccao)}</span>` : '<span class="role">sem facção</span>';
}

function tabelaBrutos(regs: RegistroBruto[]): string {
  const linhas = regs.map(r => {
    const viz = r.vizinho;
    return `<tr class="${r.status === 'descartado' ? 'linha-erro' : r.encontros ? 'linha-ok' : ''}">
      <td><span class="mono">D${r.ds}</span></td>
      <td class="r"><span class="mono">${nf.format(r.linha)}</span></td>
      <td><span class="mono">${esc(r.ts ?? '')}</span></td>
      <td><span class="mono">${r.id ?? '–'}</span></td>
      <td>${papelHtml(r)}</td>
      <td class="r"><span class="mono">${r.lat != null ? nf5.format(r.lat) : '–'}</span></td>
      <td class="r"><span class="mono">${r.lon != null ? nf5.format(r.lon) : '–'}</span></td>
      <td>${tratamentoHtml(r)}</td>
      <td>${viz ? `<span class="mono${viz.distancia < 20 ? ' forte' : ''}">#${viz.id} · ${metros(viz.distancia)}</span>` : '<span class="role">–</span>'}</td>
      <td><span class="pares-bruto">${paresHtml(r)}</span></td>
      <td><code class="bruto">${esc(r.bruto)}</code></td>
    </tr>`;
  }).join('');
  return `<div class="tablewrap"><table><thead><tr>
      <th scope="col">Fonte</th><th scope="col" class="r">Linha</th><th scope="col">Instante</th><th scope="col">Id</th><th scope="col">Papel</th>
      <th scope="col" class="r">Latitude</th><th scope="col" class="r">Longitude</th><th scope="col">Tratamento</th>
      <th scope="col">Pessoa mais próxima</th><th scope="col">Pares no pré-filtro</th><th scope="col">Conteúdo no arquivo</th>
    </tr></thead><tbody>${linhas || '<tr><td colspan="11" class="vazio-td">Nenhum registro nesta página.</td></tr>'}</tbody></table></div>`;
}

function renderBrutos(el: HTMLElement): void {
  if (!M.dados.capacidades?.brutos) {
    el.innerHTML = secao('Dados brutos', '', `<div class="aviso-box">
      <p><b>Esta aba precisa do servidor do BI.</b> Os arquivos têm 21,5 milhões de linhas e não cabem numa página: o backend entrega uma página da tabela por vez.</p>
      <p>Rode <code>npm run build</code> e depois <code>npm run bi:serve</code>, e abra <b>http://localhost:${P().portaBi}</b>.</p></div>`);
    return;
  }
  const b = ui.brutos;
  if (b.ds && !M.DSN[b.ds]) b.ds = 0;
  if (chaveBrutos !== chaveDaTela() && !carregandoPagina) void carregarPagina();

  const pg = paginaBrutos;
  const paginas = pg?.paginas ?? null;
  const resumoFontes = pg && !pg.dataset && pg.totaisPorDataset.length > 1
    ? `<span class="role">${pg.totaisPorDataset.map(t => `D${t.dataset} ${nf.format(t.registros)}`).join(' · ')}</span>` : '';

  const controles = `<div class="controles">
      <span class="ctl"><label for="b-ds">Fonte</label>
        <select class="field" id="b-ds">
          <option value="0"${b.ds === 0 ? ' selected' : ''}>Todos os datasets</option>
          ${M.DS.map(d => `<option value="${d.n}"${d.n === b.ds ? ' selected' : ''}>Só ${esc(nomeDs(d.n))}</option>`).join('')}
        </select></span>
      <span class="ctl">
        <button type="button" class="btn" id="b-ini"${b.pagina <= 1 ? ' disabled' : ''} aria-label="Primeira página">«</button>
        <button type="button" class="btn" id="b-prev"${b.pagina <= 1 ? ' disabled' : ''}>← Anterior</button>
        <label class="sr" for="b-pag">Página</label>
        <input class="field num" id="b-pag" type="number" min="1" ${paginas ? `max="${paginas}"` : ''} value="${b.pagina}">
        <span class="role">${paginas ? `de ${nf.format(paginas)}` : ''}</span>
        <button type="button" class="btn" id="b-next"${paginas && b.pagina >= paginas ? ' disabled' : ''}>Próxima →</button>
        <button type="button" class="btn" id="b-fim"${!paginas || b.pagina >= paginas ? ' disabled' : ''} aria-label="Última página">»</button>
      </span>
      <span class="ctl"><label for="b-tam">Linhas por página</label>
        <select class="field" id="b-tam">${[50, 100, 200, 500].map(n => `<option value="${n}"${n === b.tamanho ? ' selected' : ''}>${n}</option>`).join('')}</select></span>
    </div>`;

  let corpo: string;
  if (erroPagina) {
    corpo = `<div class="aviso-box"><p><b>Não foi possível carregar.</b> ${esc(erroPagina)}</p></div>`;
  } else if (!pg || carregandoPagina) {
    corpo = `<p class="vazio">Carregando…${pg ? '' : ' Na primeira vez, o backend monta um índice de cada arquivo grande (alguns segundos); depois cada página abre em menos de 1 s.'}</p>${pg ? tabelaBrutos(pg.registros) : ''}`;
  } else {
    const ini = (pg.pagina - 1) * pg.tamanho + 1, fim = Math.min(pg.total, ini + pg.registros.length - 1);
    corpo = `<p class="count">Linhas <b>${nf.format(ini)}–${nf.format(fim)}</b> de <b>${nf.format(pg.total)}</b> ${pg.dataset ? `do dataset ${pg.dataset}` : 'de todos os datasets'}</p>${tabelaBrutos(pg.registros)}`;
  }

  el.innerHTML = secao(
    'Dados brutos',
    'Todas as linhas dos arquivos de entrada, na ordem em que aparecem, com o tratamento de cada uma e a distância até a pessoa mais próxima no mesmo instante.',
    `${controles}${resumoFontes}${corpo}`
  );

  const ir = (p: number): void => { b.pagina = Math.max(1, paginas ? Math.min(p, paginas) : p); acoes.renderizar(); };
  $<HTMLSelectElement>('b-ds').onchange = ev => { b.ds = Number((ev.target as HTMLSelectElement).value); b.pagina = 1; acoes.renderizar(); };
  $<HTMLSelectElement>('b-tam').onchange = ev => {
    const primeira = (b.pagina - 1) * b.tamanho; // mantém a mesma região da tabela ao trocar o tamanho
    b.tamanho = Number((ev.target as HTMLSelectElement).value);
    b.pagina = Math.floor(primeira / b.tamanho) + 1;
    acoes.renderizar();
  };
  $('b-ini').onclick = () => ir(1);
  $('b-prev').onclick = () => ir(b.pagina - 1);
  $('b-next').onclick = () => ir(b.pagina + 1);
  $('b-fim').onclick = () => { if (paginas) ir(paginas); };
  $<HTMLInputElement>('b-pag').onchange = ev => ir(Math.floor(Number((ev.target as HTMLInputElement).value)) || 1);
  gravarHash();
}

export const abaBrutos: DefAba = {
  id: 'brutos',
  titulo: 'Dados brutos',
  escopo: 'nenhum',
  render: renderBrutos
};
