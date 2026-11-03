/** Aba Desempenho e validação: tempo, memória e acerto, mais o comparativo entre datasets. */
import { gradeCartoes, secao, vazio, type Cartao } from '../componentes/cartoes.js';
import { miniTipos } from '../componentes/graficos.js';
import { compact, fmtDataHora, fmtDur, MB, nf, nf1, nf2, sum } from '../nucleo/formato.js';
import { M, valOf } from '../nucleo/modelo.js';
import { recorte } from '../nucleo/filtros.js';
import { contagemTipos } from '../nucleo/indicadores.js';
import type { DefAba } from './aba.js';

function renderDesempenho(el: HTMLElement): void {
  const r = recorte('dataset');
  const ex = r.dss.map(d => M.EXEC[d.n]).filter(Boolean);
  const seg = sum(ex, x => x.processMs) / 1000;
  const regs = sum(ex, x => x.records);
  const gab = valOf(r.dss, 'gabarito');
  const ref = valOf(r.dss, 'referencia');
  const ok = sum(gab, x => x.corretos), ruins = sum(gab, x => x.extras + x.tipoErrado), esp = sum(gab, x => x.esperados);
  const okRef = sum(ref, x => x.corretos), espRef = sum(ref, x => x.esperados), extrasRef = sum(ref, x => x.extras);
  const semExec = 'Rode npm start para medir.';
  const semVal = M.VAL ? 'Sem verificação automática para este recorte.' : 'Rode npm test para medir.';

  const cartoes: Cartao[] = [
    { id: 'd-tm', titulo: 'Tempo médio por dataset', valor: ex.length ? `${nf2.format(seg / ex.length)}<small>s</small>` : '–',
      texto: ex.length ? `${nf2.format(seg)} s para ${plural2(ex.length)}. É o critério de desempate do desafio.` : semExec,
      como: 'Tempo de leitura e detecção de cada arquivo, medido dentro do processo (sem a inicialização do Node e sem gravar o JSON).' },
    { id: 'd-vz', titulo: 'Vazão', valor: ex.length ? `${compact(regs / seg)}<small>pos/s</small>` : '–',
      texto: ex.length ? `${nf1.format(MB(sum(ex, x => x.sizeBytes)) / seg)} MB por segundo.` : semExec },
    { id: 'd-cm', titulo: 'Custo por milhão de posições', valor: ex.length ? `${nf.format(Math.round((seg * 1000) / (regs / 1e6)))}<small>ms</small>` : '–',
      texto: ex.length ? 'Quanto menor, melhor.' : semExec },
    { id: 'd-mem', titulo: 'Pico de memória', valor: ex.some(x => x.peakRssBytes) ? `${nf.format(Math.round(Math.max(...ex.map(x => MB(x.peakRssBytes ?? 0)))))}<small>MB</small>` : '–',
      texto: ex.length ? `Para arquivos de até ${nf1.format(Math.max(...ex.map(x => MB(x.sizeBytes))))} MB. A leitura em streaming mantém o consumo estável.` : semExec,
      como: 'Maior memória usada pelo processo (RSS), amostrada a cada 25 ms durante o processamento. Inclui o próprio Node.' },
    { id: 'd-score', titulo: 'Score no gabarito oficial', valor: gab.length ? `${nf.format(ok - ruins)}<small>/${esp}</small>` : '–',
      texto: gab.length ? `${ok} corretos, ${ruins} incorretos e ${sum(gab, x => x.faltando)} faltando nos datasets ${gab.map(x => x.dataset).join(' e ')}.` : semVal,
      status: gab.length ? (ok - ruins === esp ? 'ok' : 'critico') : '', rotuloStatus: gab.length && ok - ruins === esp ? 'Máximo' : undefined,
      como: 'Fórmula do desafio: encontros corretos − encontros incorretos (falsos positivos ou tipo errado), comparando com Respostas esperadas/.' },
    { id: 'd-ref', titulo: 'Concordância com a referência', valor: ref.length ? `${nf.format(espRef ? Math.round((okRef / espRef) * 100) : 100)}<small>%</small>` : '–',
      texto: ref.length ? `${okRef} de ${espRef} encontros iguais e ${extrasRef} a mais nos datasets ${ref.map(x => x.dataset).join(', ')}.` : semVal,
      status: ref.length ? (okRef === espRef && !extrasRef ? 'ok' : 'critico') : '',
      como: 'Compara a saída com uma implementação de força bruta (todos os pares, sem pré-filtro), que roda durante o npm test.' }
  ];

  const maxMs = Math.max(1, ...ex.map(x => x.processMs));
  const linhas = r.dss.map(d => {
    const E = M.ENC.filter(e => e.ds === d.n), x = M.EXEC[d.n];
    return `<tr>
      <td><span class="mono"><b>D${d.n}</b></span>${d.oficial ? '' : ' <span class="pill">incluído</span>'}</td>
      <td class="r"><span class="mono">${x ? nf1.format(MB(x.sizeBytes)) : '–'}</span></td>
      <td class="r"><span class="mono">${x ? nf.format(x.records) : '–'}</span></td>
      <td class="r"><span class="mono">${d.monitorados.length}</span></td>
      <td class="r"><span class="mono">${d.vitimas.length}</span></td>
      <td>${d.temCadastro ? fmtDur((d.fim - d.ini) / 1000 + 5) : '–'}</td>
      <td class="r"><span class="mono"><b>${E.length}</b></span></td>
      <td>${miniTipos(contagemTipos(E))}</td>
      <td class="r"><span class="mono">${x && E.length ? nf.format(Math.round(x.records / E.length)) : '–'}</span></td>
      <td><span class="tempo"><span class="mono">${x ? `${nf2.format(x.processMs / 1000)} s` : '–'}</span>${x ? `<span class="hbar-t"><span style="width:${(x.processMs / maxMs) * 100}%;background:var(--bar)"></span></span>` : ''}</span></td>
    </tr>`;
  }).join('');
  const tabela = `<div class="tablewrap"><table><thead><tr>
      <th scope="col">Dataset</th><th scope="col" class="r">MB</th><th scope="col" class="r">Posições</th><th scope="col" class="r">Monitorados</th>
      <th scope="col" class="r">Vítimas</th><th scope="col">Período</th><th scope="col" class="r">Encontros</th><th scope="col">Por tipo</th>
      <th scope="col" class="r">Posições por encontro</th><th scope="col">Tempo</th></tr></thead><tbody>${linhas}</tbody></table></div>`;

  const ultima = ex.map(x => x.executedAt).sort().pop();
  el.innerHTML = `
    ${gradeCartoes(cartoes)}
    ${secao('Comparativo dos datasets', ultima ? `Medido em ${fmtDataHora(ultima)}. O tempo varia conforme a máquina e o cache de disco.` : '', ex.length || r.dss.length ? tabela : vazio(semExec))}`;
}

const plural2 = (n: number): string => (n === 1 ? '1 dataset' : `${n} datasets`);

export const abaDesempenho: DefAba = {
  id: 'desempenho',
  titulo: 'Desempenho',
  escopo: 'dataset',
  render: renderDesempenho
};
