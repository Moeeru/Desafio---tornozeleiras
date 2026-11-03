/** Chamadas ao servidor do BI. No modo arquivo (painel.html) só os dados embutidos existem. */
import type { CodigoErro, DadosPainel, PaginaBrutos, ResultadoInclusao, VerificacaoArquivo } from '../../../../shared/contrato.js';

declare global {
  interface Window { __DADOS__?: DadosPainel }
}

/** Erro devolvido pelo servidor, com o código do backend quando houver (ja_existe, nome_invalido...). */
export class ErroApi extends Error {
  constructor(mensagem: string, readonly codigo?: CodigoErro) { super(mensagem); }
}

async function lerResposta<T>(resp: Response): Promise<T> {
  const corpo = (await resp.json().catch(() => ({}))) as T & { erro?: string; codigo?: CodigoErro };
  if (!resp.ok || corpo.erro) throw new ErroApi(corpo.erro || `O servidor respondeu ${resp.status}.`, corpo.codigo);
  return corpo;
}

/** Pergunta ao backend se já existe um arquivo com esse nome, antes de enviar. */
export async function verificarArquivo(nome: string): Promise<VerificacaoArquivo> {
  return lerResposta<VerificacaoArquivo>(await fetch(`/api/datasets/verificar?${new URLSearchParams({ nome })}`, { cache: 'no-store' }));
}

export async function carregarDadosPainel(): Promise<DadosPainel> {
  if (window.__DADOS__) return window.__DADOS__;
  return lerResposta<DadosPainel>(await fetch('/api/dados', { cache: 'no-store' }));
}

/** Uma página da tabela de dados brutos. ds 0 = todos os datasets. */
export async function buscarPaginaBrutos(ds: number, pagina: number, tamanho: number): Promise<PaginaBrutos> {
  const q = new URLSearchParams({ ds: ds ? String(ds) : 'todos', p: String(pagina), t: String(tamanho) });
  return lerResposta<PaginaBrutos>(await fetch(`/api/brutos?${q}`, { cache: 'no-store' }));
}

/** Envia um arquivo para inclusão. Usa XHR porque o fetch não informa o progresso do envio. */
export function enviarDataset(arquivo: File, progresso: (fracao: number) => void): Promise<ResultadoInclusao> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/datasets');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Radar', '1');
    // O arquivo é gravado no backend com este nome, sem renomear
    xhr.setRequestHeader('X-Nome-Arquivo', encodeURIComponent(arquivo.name));
    xhr.upload.onprogress = ev => { if (ev.lengthComputable) progresso(ev.loaded / ev.total); };
    xhr.onerror = () => reject(new Error('A conexão com o servidor caiu durante o envio.'));
    xhr.onload = () => {
      let corpo: ResultadoInclusao & { erro?: string; codigo?: CodigoErro };
      try { corpo = JSON.parse(xhr.responseText); } catch { reject(new ErroApi(`O servidor respondeu ${xhr.status}.`)); return; }
      if (xhr.status >= 400 || corpo.erro) reject(new ErroApi(corpo.erro || `O servidor respondeu ${xhr.status}.`, corpo.codigo));
      else resolve(corpo);
    };
    xhr.send(arquivo);
  });
}

export async function removerDataset(n: number): Promise<void> {
  await lerResposta(await fetch(`/api/datasets/${n}`, { method: 'DELETE', headers: { 'X-Radar': '1' } }));
}
