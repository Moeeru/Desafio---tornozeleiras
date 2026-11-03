/**
 * Aba Incluir dados: envia um novo arquivo para ser processado e lista os datasets existentes.
 * O envio só funciona com o servidor; no painel.html a aba explica como incluir pelo terminal.
 */
import type { ResultadoInclusao } from '../../../../shared/contrato.js';
import { secao } from '../componentes/cartoes.js';
import { enviarDataset, removerDataset } from '../nucleo/api.js';
import { $, onEach } from '../nucleo/dom.js';
import { esc, fmtDataHora, MB, nf, nf1, plural } from '../nucleo/formato.js';
import { M } from '../nucleo/modelo.js';
import { acoes } from '../nucleo/estado.js';
import type { DefAba } from './aba.js';

const CABECALHO_ESPERADO = 'idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida';

let situacaoEnvio: { tipo: 'progresso' | 'ok' | 'erro'; texto: string } | null = null;
let confirmandoRemocao = 0;

function instrucoesTerminal(): string {
  return `<ol class="passos">
    <li>Coloque o arquivo em <code>Inputs/</code> com o nome <code>datasetN.txt</code> (N maior que 7), ou rode <code>npm run incluir -- caminho/do/arquivo.txt</code>, que escolhe o número e já processa.</li>
    <li>Se copiou à mão, processe com <code>npm start -- -d N</code>.</li>
    <li>Atualize o painel: <code>npm run bi</code> (arquivo) ou o botão <b>Atualizar dados</b> (servidor).</li>
  </ol>`;
}

function formatoHtml(): string {
  return `<div class="formato">
    <p>Arquivo de texto com uma posição por linha, campos separados por ponto e vírgula. A primeira linha é o cabeçalho:</p>
    <pre><code>${CABECALHO_ESPERADO}
1;7;"2024-01-01 00:00:00";-23.55000;-46.63000;false;
4;;"2024-01-01 00:00:00";-23.55010;-46.63000;true;"2"</code></pre>
    <p class="nota">Linhas com problema não impedem o processamento: elas aparecem na aba <b>Qualidade da coleta</b>. Para testar, use <code>exemplos/dataset-com-falhas.txt</code>, que tem um caso de cada falha.</p>
  </div>`;
}

function renderIncluir(el: HTMLElement): void {
  const servidor = !!M.dados.capacidades?.incluir;

  const envio = servidor ? `<form class="envio" id="i-form">
      <label class="arquivo" for="i-arq">
        <span class="arquivo-t">Escolha um arquivo .txt ou .csv</span>
        <span class="arquivo-n" id="i-nome">Nenhum arquivo escolhido</span>
        <input type="file" id="i-arq" accept=".txt,.csv,text/plain">
      </label>
      <button type="submit" class="btn primario" id="i-enviar" disabled>Enviar e processar</button>
      <div class="progresso" id="i-prog" ${situacaoEnvio ? '' : 'hidden'}>
        ${situacaoEnvio ? `<p class="${situacaoEnvio.tipo === 'erro' ? 'msg-erro' : situacaoEnvio.tipo === 'ok' ? 'msg-ok' : ''}" role="status">${situacaoEnvio.texto}</p>` : ''}
      </div>
    </form>` : `<div class="aviso-box"><p><b>O envio pela tela precisa do servidor do BI</b> (<code>npm run bi:serve</code>). Pelo terminal:</p>${instrucoesTerminal()}</div>`;

  const linhas = M.DS.map(d => {
    const x = M.EXEC[d.n];
    const falhas = x?.falhas ? Object.values(x.falhas).reduce((s, f) => s + (f?.total ?? 0), 0) : null;
    const remover = !d.oficial && servidor
      ? confirmandoRemocao === d.n
        ? `<span class="confirma">Remover D${d.n}? <button type="button" class="btn perigo" data-rm-sim="${d.n}">Sim, remover</button> <button type="button" class="btn" data-rm-nao="${d.n}">Cancelar</button></span>`
        : `<button type="button" class="btn" data-rm="${d.n}">Remover</button>`
      : '';
    return `<tr>
      <td><span class="mono"><b>D${d.n}</b></span></td>
      <td>${d.oficial ? 'oficial do desafio' : '<span class="pill">incluído</span>'}</td>
      <td class="r"><span class="mono">${x ? nf1.format(MB(x.sizeBytes)) : '–'}</span></td>
      <td class="r"><span class="mono">${x ? nf.format(x.records) : '–'}</span></td>
      <td class="r"><span class="mono">${d.temCadastro ? nf.format(M.ENC.filter(e => e.ds === d.n).length) : '–'}</span></td>
      <td>${falhas == null ? '<span class="role">–</span>' : falhas ? `<span class="pill erro">${nf.format(falhas)}</span>` : '<span class="pill ok">nenhuma</span>'}</td>
      <td><span class="role">${x ? fmtDataHora(x.executedAt) : 'não processado'}</span></td>
      <td>${remover}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="duas">
      ${secao('Incluir um arquivo de dados', 'O arquivo vira o próximo dataset (depois dos 7 oficiais), passa pela detecção e pela auditoria, e aparece em todas as abas.', envio)}
      ${secao('Formato esperado', '', formatoHtml())}
    </div>
    ${secao('Datasets', `${plural(M.DS.length, 'dataset', 'datasets')}: ${M.DS.filter(d => d.oficial).length} oficiais e ${M.DS.filter(d => !d.oficial).length} incluídos. Os oficiais não podem ser removidos.`,
      `<div class="tablewrap"><table><thead><tr><th scope="col">Dataset</th><th scope="col">Origem</th><th scope="col" class="r">MB</th>
        <th scope="col" class="r">Registros</th><th scope="col" class="r">Encontros</th><th scope="col">Falhas</th><th scope="col">Processado em</th><th scope="col"></th></tr></thead>
        <tbody>${linhas}</tbody></table></div>`)}`;

  if (servidor) ligarEnvio();
  onEach<HTMLButtonElement>(el, '[data-rm]', b => { confirmandoRemocao = Number(b.dataset.rm); acoes.renderizar(); });
  onEach<HTMLButtonElement>(el, '[data-rm-nao]', () => { confirmandoRemocao = 0; acoes.renderizar(); });
  onEach<HTMLButtonElement>(el, '[data-rm-sim]', b => {
    const n = Number(b.dataset.rmSim);
    b.disabled = true;
    removerDataset(n)
      .then(async () => { confirmandoRemocao = 0; situacaoEnvio = { tipo: 'ok', texto: `Dataset ${n} removido.` }; await acoes.recarregar(); })
      .catch(e => { confirmandoRemocao = 0; situacaoEnvio = { tipo: 'erro', texto: `Não foi possível remover: ${esc((e as Error).message)}` }; acoes.renderizar(); });
  });
}

function ligarEnvio(): void {
  const input = $<HTMLInputElement>('i-arq');
  const botao = $<HTMLButtonElement>('i-enviar');
  input.onchange = () => {
    const f = input.files?.[0];
    $('i-nome').textContent = f ? `${f.name} · ${nf1.format(MB(f.size))} MB` : 'Nenhum arquivo escolhido';
    botao.disabled = !f;
  };
  $<HTMLFormElement>('i-form').onsubmit = ev => {
    ev.preventDefault();
    const f = input.files?.[0];
    if (!f) return;
    botao.disabled = true;
    input.disabled = true;
    const prog = $('i-prog');
    prog.hidden = false;
    const mostrar = (txt: string, cls = ''): void => { prog.innerHTML = `<p class="${cls}" role="status">${txt}</p>`; };
    mostrar('Enviando… 0%');
    enviarDataset(f, fr => mostrar(fr < 1 ? `Enviando… ${Math.round(fr * 100)}%` : 'Arquivo recebido. Processando no backend…'))
      .then(async (r: ResultadoInclusao) => {
        situacaoEnvio = {
          tipo: 'ok',
          texto: `Incluído como <b>dataset ${r.dataset}</b>: ${nf.format(r.registros)} registros, ${plural(r.encontros, 'encontro', 'encontros')}` +
            (r.falhas ? `, ${plural(r.falhas, 'falha de coleta', 'falhas de coleta')} (veja a aba Qualidade da coleta).` : ', nenhuma falha de coleta.')
        };
        await acoes.recarregar();
      })
      .catch(e => {
        situacaoEnvio = { tipo: 'erro', texto: `Não foi possível incluir: ${esc((e as Error).message)}` };
        acoes.renderizar();
      });
  };
}

export const abaIncluir: DefAba = {
  id: 'incluir',
  titulo: 'Incluir dados',
  escopo: 'nenhum',
  render: renderIncluir
};
