/** Aba Resumo: os poucos números que respondem "o que aconteceu", com links para o detalhe. */
import { gradeCartoes, secao, type Cartao } from '../componentes/cartoes.js';
import { composicaoHtml, funilHtml } from '../componentes/graficos.js';
import { $ } from '../nucleo/dom.js';
import { compact, nf, nf1, pct, plural } from '../nucleo/formato.js';
import { acoes } from '../nucleo/estado.js';
import { descreverRecorte, recorte } from '../nucleo/filtros.js';
import { contagemTipos, estatEncontros, estatFaccoes, estatVitimas, falhasDe, funilDe } from '../nucleo/indicadores.js';
import type { DefAba } from './aba.js';

const pctFino = (a: number, b: number): string => {
  if (!b) return '0%';
  const p = (a / b) * 100;
  return p >= 1 ? `${nf1.format(p)}%` : `${p.toFixed(4).replace('.', ',').replace(/0+$/, '')}%`;
};

function renderResumo(el: HTMLElement): void {
  const r = recorte('todos');
  const rd = recorte('dataset');
  const enc = estatEncontros(r, 10);
  const vit = estatVitimas(r);
  const fac = estatFaccoes(r);
  const funil = funilDe(rd.dss);
  const falhas = falhasDe(rd.dss);

  const lede = r.enc.length
    ? `<strong>${plural(r.enc.length, 'encontro', 'encontros')}</strong> ${descreverRecorte(r)}. ` +
      (vit.violacoes
        ? `<span class="hot">${plural(vit.violacoes, 'é violação', 'são violações')} de medida protetiva</span>, envolvendo ${vit.afetadas} de ${vit.total} vítimas.`
        : 'Nenhuma violação de medida protetiva.')
    : `Nenhum encontro ${descreverRecorte(r)} com esses filtros.`;

  const cartoes: Cartao[] = [
    {
      id: 'r-enc', titulo: 'Encontros detectados', valor: nf.format(enc.total),
      texto: `${plural(enc.pares, 'par de pessoas', 'pares de pessoas')} diferentes, em ${plural(enc.episodios, 'episódio', 'episódios')}.`,
      como: 'Pares a menos de 20 m no mesmo instante, um registro por par em cada timestamp (regra do desafio). Leituras seguidas do mesmo par formam um episódio.',
      acao: { rotulo: 'Ver encontros', id: 'r-go-enc' }
    },
    {
      id: 'r-viol', titulo: 'Violações de medida protetiva', valor: nf.format(vit.violacoes),
      texto: 'Vezes em que um agressor ficou a menos de 20 m da vítima protegida contra ele.',
      status: vit.violacoes ? 'critico' : 'ok', rotuloStatus: vit.violacoes ? 'Crítico' : 'Nenhuma',
      acao: { rotulo: 'Ver vítimas', id: 'r-go-vit' }
    },
    {
      id: 'r-vitaf', titulo: 'Vítimas afetadas', valor: vit.total ? `${vit.afetadas}<small>/${vit.total}</small>` : '–',
      texto: vit.total ? `${pct(vit.afetadas, vit.total)}% das vítimas tiveram o agressor por perto.` : 'Nenhuma vítima neste recorte.',
      status: vit.afetadas ? 'critico' : vit.total ? 'ok' : ''
    },
    {
      id: 'r-fac', titulo: 'Encontros entre membros de facção', valor: nf.format(fac.encontros),
      texto: fac.encontros ? `${plural(fac.ativas, 'facção envolvida', 'facções envolvidas')}, ${pct(fac.encontros, enc.total)}% dos encontros.` : 'Nenhum encontro de facção neste recorte.',
      acao: { rotulo: 'Ver facções', id: 'r-go-fac' }
    },
    {
      id: 'r-uteis', titulo: 'Registros úteis para a detecção',
      valor: funil ? `${nf.format(funil.registrosEmEncontro)}` : '–',
      texto: funil
        ? `de ${compact(funil.registrosValidos)} registros válidos (${pctFino(funil.registrosEmEncontro, funil.registrosValidos)}) fazem parte de um encontro.`
        : 'Rode npm start para medir.',
      como: 'Registros (uma posição de uma pessoa num instante) que participam de pelo menos um encontro ÷ registros válidos lidos. Usa só o filtro de dataset.',
      acao: { rotulo: 'Ver o caminho dos registros', id: 'r-go-funil' }
    },
    {
      id: 'r-falhas', titulo: 'Falhas na coleta', valor: falhas.medidos ? nf.format(falhas.total) : '–',
      texto: !falhas.medidos ? 'Rode npm start para auditar os arquivos.'
        : falhas.total ? `${plural(falhas.porTipo.size, 'tipo de problema encontrado', 'tipos de problema encontrados')} nos arquivos de entrada.`
          : 'Nenhuma linha inválida, fora de ordem, duplicada ou ausente.',
      status: !falhas.medidos ? '' : falhas.total ? 'atencao' : 'ok', rotuloStatus: falhas.total ? 'Atenção' : 'Sem falhas',
      como: 'Soma das falhas encontradas pela auditoria do backend em cada arquivo (10 verificações). Usa só o filtro de dataset.',
      acao: { rotulo: 'Ver qualidade da coleta', id: 'r-go-qual' }
    }
  ];

  const funis = funil ? `<div class="duas">
      <div class="painel"><h3>Registros</h3>${funilHtml([
        { rotulo: 'Linhas lidas', valor: funil.linhasLidas, desc: 'Todas as linhas não vazias dos arquivos, incluindo o cabeçalho.' },
        { rotulo: 'Registros válidos', valor: funil.registrosValidos, desc: `${nf.format(funil.registrosDescartados)} descartados por falha de coleta.` },
        { rotulo: 'Com alguém por perto', valor: funil.registrosCandidatos, desc: 'Registros com pelo menos um vizinho no pré-filtro (a menos de ~25 m).' },
        { rotulo: 'Em um encontro', valor: funil.registrosEmEncontro, desc: 'Registros úteis: fazem parte de um encontro registrado.' }
      ])}</div>
      <div class="painel"><h3>Pares comparados</h3>${funilHtml([
        { rotulo: 'Pares possíveis', valor: funil.paresComparados, desc: 'Todas as combinações de duas pessoas dentro de cada instante.' },
        { rotulo: 'Passaram o pré-filtro', valor: funil.paresPreFiltro, desc: 'Só esses têm a distância calculada pela fórmula de Haversine.' },
        { rotulo: 'A menos de 20 m', valor: funil.paresProximos, desc: `${nf.format(funil.paresIgnorados)} descartados pela regra da vítima sem relação com o outro.` },
        { rotulo: 'Encontros registrados', valor: funil.encontros, desc: 'Gravados em outputs/respostasN.json.' }
      ])}</div>
    </div>` : '<p class="vazio">Rode <code>npm start</code> para medir o caminho dos registros.</p>';

  el.innerHTML = `
    <p class="lede">${lede}</p>
    ${gradeCartoes(cartoes)}
    ${secao('Tipos de encontro', 'Proporção de cada tipo no recorte filtrado.', composicaoHtml(contagemTipos(r.enc)))}
    <div id="r-funil">${secao('Do registro ao encontro', 'Quantos registros e pares chegam a cada etapa da detecção. Usa só o filtro de dataset.', funis)}</div>`;

  const ir = (id: string, aba: Parameters<typeof acoes.irPara>[0]): void => { const b = document.getElementById(id); if (b) b.onclick = () => acoes.irPara(aba); };
  ir('r-go-enc', 'encontros');
  ir('r-go-vit', 'vitimas');
  ir('r-go-fac', 'faccoes');
  ir('r-go-qual', 'qualidade');
  const f = document.getElementById('r-go-funil');
  if (f) f.onclick = () => $('r-funil').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export const abaResumo: DefAba = {
  id: 'resumo',
  titulo: 'Resumo',
  escopo: 'todos',
  render: renderResumo
};
