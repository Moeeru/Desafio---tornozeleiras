/**
 * Cartão de indicador: uma pergunta, um número, uma frase de explicação e, opcionalmente,
 * a situação (crítico/atenção/OK), como é calculado e um link para a aba com os detalhes.
 */
import { esc } from '../nucleo/formato.js';

export type Status = 'critico' | 'atencao' | 'ok' | '';

export interface Cartao {
  id: string;
  titulo: string;
  /** HTML do número (pode ter <small> para a unidade). '–' quando não há dado. */
  valor: string;
  texto: string;
  status?: Status;
  /** Rótulo do status, quando o padrão (Crítico/Atenção/OK) não descreve bem. */
  rotuloStatus?: string;
  como?: string;
  acao?: { rotulo: string; id: string };
  /** Cartão maior, ocupando duas colunas. */
  largo?: boolean;
}

const ROTULO: Record<Exclude<Status, ''>, string> = { critico: 'Crítico', atencao: 'Atenção', ok: 'OK' };

export function cartaoHtml(c: Cartao): string {
  const st = c.status ? `<span class="status ${c.status}">${esc(c.rotuloStatus ?? ROTULO[c.status])}</span>` : '';
  return `<article class="kcard${c.largo ? ' largo' : ''}${c.valor === '–' ? ' na' : ''}" id="k-${c.id}">
    <header><h3>${c.titulo}</h3>${st}</header>
    <p class="kval">${c.valor}</p>
    <p class="ktxt">${c.texto}</p>
    ${c.como || c.acao ? `<footer>
      ${c.como ? `<details class="como"><summary>Como é calculado</summary><p>${c.como}</p></details>` : ''}
      ${c.acao ? `<button type="button" class="link" id="${c.acao.id}">${esc(c.acao.rotulo)} →</button>` : ''}
    </footer>` : ''}
  </article>`;
}

export const gradeCartoes = (cs: Cartao[]): string => `<div class="kgrid">${cs.map(cartaoHtml).join('')}</div>`;

/** Seção com título e descrição, para separar blocos dentro de uma aba. */
export function secao(titulo: string, desc: string, corpo: string, extra = ''): string {
  return `<section class="bloco">
    <div class="bloco-h"><div><h2>${titulo}</h2>${desc ? `<p>${desc}</p>` : ''}</div>${extra}</div>
    ${corpo}
  </section>`;
}

/** Mensagem de estado vazio, com o que fazer para preencher. */
export const vazio = (msg: string): string => `<p class="vazio">${msg}</p>`;
