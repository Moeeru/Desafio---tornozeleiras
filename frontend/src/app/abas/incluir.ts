/**
 * Aba Incluir dados: envia um novo arquivo para ser processado e lista os datasets existentes.
 * Ao escolher o arquivo, pergunta ao backend se o nome já existe: se existir, mostra o aviso e
 * não envia; se não, o arquivo é gravado com o nome original.
 * O envio só funciona com o servidor; no painel.html a aba explica como incluir pelo terminal.
 */
import type { ResultadoInclusao, VerificacaoArquivo } from '../../../../shared/contrato.js';
import { secao } from '../componentes/cartoes.js';
import { ErroApi, enviarDataset, removerDataset, verificarArquivo } from '../nucleo/api.js';
import { $, onEach } from '../nucleo/dom.js';
import { esc, fmtDataHora, MB, nf, nf1, plural } from '../nucleo/formato.js';
import { M, P } from '../nucleo/modelo.js';
import { acoes } from '../nucleo/estado.js';
import type { DefAba } from './aba.js';

type Situacao = { tipo: 'progresso' | 'ok' | 'erro' | 'aviso'; texto: string };
let situacaoEnvio: Situacao | null = null;
let confirmandoRemocao = 0;

const CLASSE: Record<Situacao['tipo'], string> = { progresso: '', ok: 'msg-ok', erro: 'msg-erro', aviso: 'msg-aviso' };
const situacaoHtml = (s: Situacao): string => `<p class="${CLASSE[s.tipo]}" role="status">${s.texto}</p>`;

function instrucoesTerminal(): string {
  const p = P();
  return `<ol class="passos">
    <li>Rode <code>npm run incluir -- caminho/do/arquivo${p.extensoes[0] ?? ''}</code>: o arquivo é copiado para <code>${esc(p.pastaEntradas)}/</code> com o mesmo nome, recebe o próximo número e já é processado. Se já existir um arquivo com esse nome, nada é sobrescrito.</li>
    <li>Ou copie o arquivo para <code>${esc(p.pastaEntradas)}/</code> à mão e rode <code>npm start</code>.</li>
    <li>Atualize o painel: <code>npm run bi</code> (arquivo) ou o botão <b>Atualizar dados</b> (servidor).</li>
  </ol>`;
}

function formatoHtml(): string {
  return `<div class="formato">
    <p>Arquivo de texto (${P().extensoes.map(e => `<code>${esc(e)}</code>`).join(' ou ')}) com uma posição por linha, campos separados por ponto e vírgula. A primeira linha é o cabeçalho:</p>
    <pre><code>${esc(P().cabecalho)}
1;7;"2024-01-01 00:00:00";-23.55000;-46.63000;false;
4;;"2024-01-01 00:00:00";-23.55010;-46.63000;true;"2"</code></pre>
    <p class="nota">O arquivo é gravado com o nome que tem; dois arquivos com o mesmo nome (sem diferenciar maiúsculas) ou com o mesmo conteúdo não são aceitos. Linhas com problema não impedem o processamento: elas aparecem na aba <b>Qualidade da coleta</b>. Para testar, use <code>exemplos/dataset-com-falhas.txt</code>.</p>
  </div>`;
}

function renderIncluir(el: HTMLElement): void {
  const servidor = !!M.dados.capacidades?.incluir;
  const oficiais = M.DS.filter(d => d.oficial).length, incluidos = M.DS.length - oficiais;

  const envio = servidor ? `<form class="envio" id="i-form">
      <label class="arquivo" for="i-arq">
        <span class="arquivo-t">Escolha um arquivo ${P().extensoes.map(esc).join(' ou ')}</span>
        <span class="arquivo-n" id="i-nome">Nenhum arquivo escolhido</span>
        <input type="file" id="i-arq" accept="${P().extensoes.map(esc).join(',')},text/plain">
      </label>
      <div id="i-verif" role="status" aria-live="polite"></div>
      <button type="submit" class="btn primario" id="i-enviar" disabled>Enviar e processar</button>
      <div class="progresso" id="i-prog" ${situacaoEnvio ? '' : 'hidden'}>${situacaoEnvio ? situacaoHtml(situacaoEnvio) : ''}</div>
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
      <td>${d.arquivo ? `<span class="mono arq-nome" title="${esc(d.arquivo)}">${esc(d.arquivo)}</span>` : '<span class="role">desconhecido</span>'}</td>
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
      ${secao('Incluir um arquivo de dados', `O arquivo é gravado em ${esc(P().pastaEntradas)}/ com o nome original, vira o próximo dataset, passa pela detecção e pela auditoria e aparece em todas as abas.`, envio)}
      ${secao('Formato esperado', '', formatoHtml())}
    </div>
    ${secao('Datasets', `${plural(M.DS.length, 'dataset', 'datasets')}: ${oficiais} ${oficiais === 1 ? 'oficial' : 'oficiais'} e ${incluidos} ${incluidos === 1 ? 'incluído' : 'incluídos'}. Os oficiais não podem ser removidos.`,
      `<div class="tablewrap"><table><thead><tr><th scope="col">Dataset</th><th scope="col">Arquivo</th><th scope="col">Origem</th><th scope="col" class="r">MB</th>
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

/** Aviso de nome já existente (ou inválido) logo abaixo do campo do arquivo. */
function avisoVerificacao(v: VerificacaoArquivo): Situacao {
  if (!v.valido) return { tipo: 'erro', texto: `<b>Nome não aceito:</b> ${esc(v.mensagem)}` };
  if (v.existe) {
    const dica = v.dataset && !v.oficial
      ? ` Renomeie o arquivo antes de enviar, ou remova o dataset ${v.dataset} na tabela abaixo.`
      : ' Renomeie o arquivo antes de enviar.';
    return { tipo: 'aviso', texto: `<b>Este arquivo já existe no backend.</b> ${esc(v.mensagem)}${dica} Nada foi enviado.` };
  }
  return { tipo: 'ok', texto: esc(v.mensagem) };
}

function ligarEnvio(): void {
  const input = $<HTMLInputElement>('i-arq');
  const botao = $<HTMLButtonElement>('i-enviar');
  const verif = $('i-verif');
  let pedido = 0;

  input.onchange = () => {
    const f = input.files?.[0];
    $('i-nome').textContent = f ? `${f.name} · ${nf1.format(MB(f.size))} MB` : 'Nenhum arquivo escolhido';
    botao.disabled = true;
    verif.innerHTML = '';
    if (!f) return;
    if (f.size > P().limiteUploadBytes) {
      verif.innerHTML = situacaoHtml({ tipo: 'erro', texto: `O arquivo passa do limite de ${nf.format(MB(P().limiteUploadBytes))} MB.` });
      return;
    }
    // Verifica no backend antes de enviar; respostas de escolhas antigas são ignoradas
    const meu = ++pedido;
    verif.innerHTML = situacaoHtml({ tipo: 'progresso', texto: 'Verificando se o arquivo já existe no backend…' });
    verificarArquivo(f.name)
      .then(v => {
        if (meu !== pedido) return;
        verif.innerHTML = situacaoHtml(avisoVerificacao(v));
        botao.disabled = !v.valido || v.existe;
      })
      .catch(e => {
        if (meu !== pedido) return;
        verif.innerHTML = situacaoHtml({ tipo: 'erro', texto: `Não foi possível verificar: ${esc((e as Error).message)}` });
      });
  };

  $<HTMLFormElement>('i-form').onsubmit = ev => {
    ev.preventDefault();
    const f = input.files?.[0];
    if (!f || botao.disabled) return;
    botao.disabled = true;
    input.disabled = true;
    const prog = $('i-prog');
    prog.hidden = false;
    const mostrar = (txt: string): void => { prog.innerHTML = situacaoHtml({ tipo: 'progresso', texto: txt }); };
    mostrar('Enviando… 0%');
    enviarDataset(f, fr => mostrar(fr < 1 ? `Enviando… ${Math.round(fr * 100)}%` : 'Arquivo recebido. Processando no backend…'))
      .then(async (r: ResultadoInclusao) => {
        situacaoEnvio = {
          tipo: 'ok',
          texto: `<b>${esc(r.nome)}</b> incluído como <b>dataset ${r.dataset}</b> (${esc(r.arquivo)}): ${nf.format(r.registros)} registros, ${plural(r.encontros, 'encontro', 'encontros')}` +
            (r.falhas ? `, ${plural(r.falhas, 'falha de coleta', 'falhas de coleta')} (veja a aba Qualidade da coleta).` : ', nenhuma falha de coleta.')
        };
        await acoes.recarregar();
      })
      .catch(e => {
        const codigo = e instanceof ErroApi ? e.codigo : undefined;
        // Arquivo repetido (mesmo nome ou mesmo conteúdo) é aviso, não falha
        situacaoEnvio = codigo === 'ja_existe' || codigo === 'conteudo_duplicado'
          ? { tipo: 'aviso', texto: `<b>Este arquivo já existe no backend.</b> ${esc((e as Error).message)}` }
          : { tipo: 'erro', texto: `Não foi possível incluir: ${esc((e as Error).message)}` };
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
