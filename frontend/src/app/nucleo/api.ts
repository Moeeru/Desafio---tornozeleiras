/** Chamadas ao servidor do BI. No modo arquivo (painel.html) só os dados embutidos existem. */
import type { DadosPainel, PaginaBrutos, ResultadoInclusao } from '../../../../shared/contrato.js';

declare global {
  interface Window { __DADOS__?: DadosPainel }
}

async function lerResposta<T>(resp: Response): Promise<T> {
  const corpo = (await resp.json().catch(() => ({}))) as T & { erro?: string };
  if (!resp.ok || corpo.erro) throw new Error(corpo.erro || `O servidor respondeu ${resp.status}.`);
  return corpo;
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
    xhr.upload.onprogress = ev => { if (ev.lengthComputable) progresso(ev.loaded / ev.total); };
    xhr.onerror = () => reject(new Error('A conexão com o servidor caiu durante o envio.'));
    xhr.onload = () => {
      let corpo: ResultadoInclusao & { erro?: string };
      try { corpo = JSON.parse(xhr.responseText); } catch { reject(new Error(`O servidor respondeu ${xhr.status}.`)); return; }
      if (xhr.status >= 400 || corpo.erro) reject(new Error(corpo.erro || `O servidor respondeu ${xhr.status}.`));
      else resolve(corpo);
    };
    xhr.send(arquivo);
  });
}

export async function removerDataset(n: number): Promise<void> {
  await lerResposta(await fetch(`/api/datasets/${n}`, { method: 'DELETE', headers: { 'X-Radar': '1' } }));
}
