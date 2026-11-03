/**
 * Aba Qualidade da coleta: as 10 verificações que o backend faz em cada arquivo, com os
 * casos encontrados (linha e conteúdo), e quantos registros lidos são úteis para a detecção.
 */
import type { TipoFalha } from '../../../../shared/contrato.js';
import { gradeCartoes, secao, vazio, type Cartao } from '../componentes/cartoes.js';
import { onEach } from '../nucleo/dom.js';
import { compact, esc, nf, nf1, pct, plural } from '../nucleo/formato.js';
import { M } from '../nucleo/modelo.js';
import { acoes } from '../nucleo/estado.js';
import { recorte } from '../nucleo/filtros.js';
import { falhasDe, funilDe } from '../nucleo/indicadores.js';
import type { DefAba } from './aba.js';

export const VERIFICACOES: { k: TipoFalha; nome: string; desc: string; efeito: string }[] = [
  { k: 'linha_invalida', nome: 'Linhas inválidas', desc: 'Linhas sem os 7 campos separados por ";".', efeito: 'A linha é descartada.' },
  { k: 'id_invalido', nome: 'Ids inválidos', desc: 'O primeiro campo não é um número.', efeito: 'A linha é descartada.' },
  { k: 'coordenada_invalida', nome: 'Coordenadas inválidas', desc: 'Latitude fora de −90 a 90, longitude fora de −180 a 180, ou valor ausente.', efeito: 'A linha é descartada, porque não dá para calcular distância.' },
  { k: 'timestamp_invalido', nome: 'Timestamps fora do formato', desc: 'O horário não segue AAAA-MM-DD HH:MM:SS.', efeito: 'A leitura é usada, mas a ordem dos instantes pode ficar errada.' },
  { k: 'fora_de_ordem', nome: 'Leituras fora de ordem', desc: 'Um instante anterior aparece depois de um posterior.', efeito: 'O agrupamento por instante assume o arquivo ordenado por tempo.' },
  { k: 'instante_repetido', nome: 'Instantes fora de sequência', desc: 'Um instante volta a aparecer depois de outro.', efeito: 'As leituras desse instante ficam em lotes separados; encontros entre os lotes não são detectados.' },
  { k: 'leitura_duplicada', nome: 'Leituras duplicadas', desc: 'O mesmo id tem mais de uma posição no mesmo instante.', efeito: 'A repetição é ignorada.' },
  { k: 'leitura_ausente', nome: 'Leituras ausentes', desc: 'Um id não enviou posição em algum instante.', efeito: 'Não há como detectar encontro dessa pessoa nesses instantes.' },
  { k: 'restricao_desconhecida', nome: 'Restrição para id inexistente', desc: 'A vítima é protegida contra um id que não aparece no arquivo.', efeito: 'Essa restrição nunca gera encontro.' },
  { k: 'cadastro_inconsistente', nome: 'Cadastro inconsistente', desc: 'Vítima com facção preenchida, ou lista de restrição em quem não é vítima.', efeito: 'A leitura é usada como está.' }
];

function renderQualidade(el: HTMLElement): void {
  const r = recorte('dataset');
  const f = falhasDe(r.dss);
  const funil = funilDe(r.dss);
  const ex = r.dss.map(d => M.EXEC[d.n]).filter(Boolean);
  const comp = ex.filter(x => x.distinctIds != null);
  const completude = comp.length ? (comp.reduce((s, x) => s + x.records, 0) / comp.reduce((s, x) => s + x.timestamps * (x.distinctIds ?? 0), 0)) * 100 : null;

  if (!f.medidos) {
    el.innerHTML = secao('Qualidade da coleta', '', vazio('Nenhum dataset auditado ainda. Rode <code>npm start</code> para processar e auditar os arquivos.'));
    return;
  }

  const cartoes: Cartao[] = [
    { id: 'q-falhas', titulo: 'Falhas encontradas', valor: nf.format(f.total),
      texto: f.total ? `${plural(f.porTipo.size, 'tipo de problema', 'tipos de problema')} em ${plural(f.medidos, 'dataset auditado', 'datasets auditados')}.` : `Nenhum problema em ${plural(f.medidos, 'dataset auditado', 'datasets auditados')}.`,
      status: f.total ? 'atencao' : 'ok', rotuloStatus: f.total ? 'Atenção' : 'Sem falhas' },
    { id: 'q-lidos', titulo: 'Registros lidos', valor: funil ? compact(funil.linhasLidas - funil.cabecalhos) : '–',
      texto: funil ? `${nf.format(funil.linhasLidas - funil.cabecalhos)} linhas de dados, sem contar o cabeçalho.` : '' },
    { id: 'q-validos', titulo: 'Registros válidos', valor: funil ? `${nf1.format((funil.registrosValidos / Math.max(1, funil.linhasLidas - funil.cabecalhos)) * 100)}<small>%</small>` : '–',
      texto: funil ? `${nf.format(funil.registrosDescartados)} descartados por falha de coleta.` : '',
      status: funil && funil.registrosDescartados ? 'atencao' : funil ? 'ok' : '' },
    { id: 'q-uteis', titulo: 'Registros úteis', valor: funil ? nf.format(funil.registrosEmEncontro) : '–',
      texto: funil ? `fazem parte de um encontro. Os demais ${compact(funil.registrosValidos - funil.registrosEmEncontro)} não tinham ninguém a menos de 20 m.` : '',
      como: 'Registros que participam de pelo menos um encontro. Cada encontro usa dois registros; um registro pode estar em mais de um encontro.' },
    { id: 'q-comp', titulo: 'Completude das leituras', valor: completude == null ? '–' : `${nf1.format(completude)}<small>%</small>`,
      texto: 'Leituras recebidas ÷ leituras esperadas (pessoas × instantes).', status: completude == null ? '' : completude >= 99.95 ? 'ok' : 'atencao' }
  ];

  const linhasVerif = VERIFICACOES.map(v => {
    const x = f.porTipo.get(v.k);
    const n = x?.total ?? 0;
    const exemplos = x && x.exemplos.length ? `<details class="exemplos"><summary>Ver ${plural(x.exemplos.length, 'caso', 'primeiros casos')}${n > x.exemplos.length ? ` de ${nf.format(n)}` : ''}</summary>
        <div class="tablewrap"><table><thead><tr><th scope="col">Dataset</th><th scope="col" class="r">Linha</th><th scope="col">Conteúdo</th><th scope="col">O que foi encontrado</th></tr></thead><tbody>
        ${x.exemplos.map(e => `<tr><td><span class="mono">D${e.ds}</span></td><td class="r"><span class="mono">${e.linha == null ? '–' : nf.format(e.linha)}</span></td>
          <td><code class="bruto">${esc(e.conteudo)}</code></td><td>${esc(e.detalhe)}</td></tr>`).join('')}
        </tbody></table></div></details>` : '';
    return `<li class="verif ${n ? 'falhou' : 'passou'}">
      <span class="verif-st" aria-hidden="true">${n ? '!' : '✓'}</span>
      <div class="verif-c">
        <div class="verif-h"><b>${v.nome}</b><span class="verif-n">${n ? plural(n, 'caso', 'casos') : 'Nenhum caso'}</span></div>
        <p>${v.desc} <span class="role">${v.efeito}</span></p>
        ${exemplos}
      </div>
    </li>`;
  }).join('');

  const tabelaDs = `<div class="tablewrap"><table><thead><tr>
      <th scope="col">Dataset</th><th scope="col">Origem</th><th scope="col" class="r">Registros lidos</th><th scope="col" class="r">Válidos</th>
      <th scope="col" class="r">Descartados</th><th scope="col" class="r">Com alguém por perto</th><th scope="col" class="r">Úteis (em encontro)</th><th scope="col">Falhas</th>
    </tr></thead><tbody>${r.dss.map(d => {
      const x = M.EXEC[d.n];
      const fu = x?.funil;
      const tf = x?.falhas ? Object.values(x.falhas).reduce((s, y) => s + (y?.total ?? 0), 0) : null;
      if (!x) return `<tr><td><span class="mono">D${d.n}</span></td><td>${d.oficial ? 'oficial' : 'incluído'}</td><td colspan="6" class="role">ainda não processado</td></tr>`;
      return `<tr>
        <td><span class="mono">D${d.n}</span></td><td>${d.oficial ? 'oficial' : '<span class="pill">incluído</span>'}</td>
        <td class="r"><span class="mono">${fu ? nf.format(fu.linhasLidas - fu.cabecalhos) : nf.format(x.records)}</span></td>
        <td class="r"><span class="mono">${nf.format(fu?.registrosValidos ?? x.records)}</span></td>
        <td class="r"><span class="mono">${fu ? nf.format(fu.registrosDescartados) : '–'}</span></td>
        <td class="r"><span class="mono">${fu ? nf.format(fu.registrosCandidatos) : '–'}</span></td>
        <td class="r"><span class="mono">${fu ? `${nf.format(fu.registrosEmEncontro)} <small class="role">(${fu.registrosValidos ? `${nf1.format((fu.registrosEmEncontro / fu.registrosValidos) * 100).replace(/^0,0$/, '<0,1')}%` : '–'})</small>` : '–'}</span></td>
        <td>${tf == null ? '<span class="role">não auditado</span>' : tf ? `<span class="pill erro">${nf.format(tf)}</span>` : '<span class="pill ok">nenhuma</span>'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;

  const dica = M.dados.capacidades?.incluir
    ? '<p class="nota">Para ver esta tela com falhas, inclua o arquivo <code>exemplos/dataset-com-falhas.txt</code> na aba <button type="button" class="link-mini" id="q-ir-incluir">Incluir dados</button>. Ele tem um caso de cada tipo.</p>'
    : '<p class="nota">Para ver esta tela com falhas, rode <code>npm run incluir -- exemplos/dataset-com-falhas.txt</code>. O arquivo tem um caso de cada tipo.</p>';

  el.innerHTML = `
    ${gradeCartoes(cartoes)}
    ${secao('Verificações da coleta', `${plural(VERIFICACOES.length, 'verificação feita', 'verificações feitas')} pelo backend em cada linha de cada arquivo. ${pct(VERIFICACOES.filter(v => !f.porTipo.get(v.k)?.total).length, VERIFICACOES.length)}% sem nenhum caso.`,
      `<ul class="verifs">${linhasVerif}</ul>`)}
    ${secao('Registros encontrados e úteis por dataset', 'Quantos registros cada arquivo tem e quantos chegam a fazer parte de um encontro.', tabelaDs)}
    ${f.total ? '' : dica}`;
  onEach<HTMLButtonElement>(el, '#q-ir-incluir', () => acoes.irPara('incluir'));
}

export const abaQualidade: DefAba = {
  id: 'qualidade',
  titulo: 'Qualidade da coleta',
  escopo: 'dataset',
  contador: () => {
    const f = falhasDe(recorte('dataset').dss);
    return f.medidos ? { texto: f.total ? nf.format(f.total) : 'OK', alerta: f.total > 0 } : null;
  },
  render: renderQualidade
};
