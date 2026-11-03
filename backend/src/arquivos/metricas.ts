/** Leitura e gravação de metricas/execucao.json, o arquivo que o BI lê. */
import fs from 'fs';
import path from 'path';
import type { Execucao } from '../../../shared/contrato';
import type { RunMetrics } from '../deteccao/types';
import { PASTAS } from './datasets';

export const ARQUIVO_EXECUCAO = path.join(PASTAS.metricas, 'execucao.json');
export const ARQUIVO_VALIDACAO = path.join(PASTAS.metricas, 'validacao.json');

/** Métricas já gravadas, por dataset (rodar um dataset só não apaga os demais). */
export function lerExecucao(): Map<number, Execucao> {
  const m = new Map<number, Execucao>();
  if (!fs.existsSync(ARQUIVO_EXECUCAO)) return m;
  try {
    for (const e of JSON.parse(fs.readFileSync(ARQUIVO_EXECUCAO, 'utf8')) as Execucao[]) m.set(e.dataset, e);
  } catch {
    console.warn(`[AVISO] ${ARQUIVO_EXECUCAO} está ilegível e será recriado.`);
  }
  return m;
}

export function gravarExecucao(metricas: Map<number, Execucao | RunMetrics>): void {
  fs.mkdirSync(PASTAS.metricas, { recursive: true });
  // Tipado pelo contrato com o BI: se RunMetrics deixar de ser compatível, a compilação falha.
  const lista = [...metricas.values()].sort((a, b) => a.dataset - b.dataset) satisfies Execucao[];
  fs.writeFileSync(ARQUIVO_EXECUCAO, JSON.stringify(lista, null, 2), 'utf8');
}
