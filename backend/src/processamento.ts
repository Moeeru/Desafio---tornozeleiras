/** Processa um dataset de ponta a ponta: detecção, gravação da resposta e métricas. */
import fs from 'fs';
import type { TipoFalha } from '../../shared/contrato';
import { arquivoDataset, arquivoResposta, PASTAS } from './arquivos/datasets';
import { EncounterDetector } from './deteccao/detector';
import type { Encounter, EncounterType, RunMetrics } from './deteccao/types';

export interface ResultadoDataset {
  metricas: RunMetrics;
  encontros: Encounter[];
}

export const NOMES_FALHA: Record<TipoFalha, string> = {
  linha_invalida: 'linha(s) inválida(s)',
  id_invalido: 'id(s) inválido(s)',
  coordenada_invalida: 'coordenada(s) inválida(s)',
  timestamp_invalido: 'timestamp(s) fora do formato',
  fora_de_ordem: 'leitura(s) fora de ordem',
  instante_repetido: 'instante(s) fora de sequência',
  leitura_duplicada: 'leitura(s) duplicada(s)',
  leitura_ausente: 'leitura(s) ausente(s)',
  restricao_desconhecida: 'restrição(ões) para id inexistente',
  cadastro_inconsistente: 'cadastro(s) inconsistente(s)'
};

export async function processarDataset(n: number, detector = new EncounterDetector()): Promise<ResultadoDataset> {
  const entrada = arquivoDataset(n);
  const tamanho = fs.statSync(entrada).size;

  // Amostra o RSS a cada 25 ms enquanto o arquivo é processado (o laço assíncrono cede a vez ao timer).
  let picoRss = process.memoryUsage.rss();
  const amostrador = setInterval(() => {
    const rss = process.memoryUsage.rss();
    if (rss > picoRss) picoRss = rss;
  }, 25);

  const inicio = performance.now();
  const encontros = await detector.processFile(entrada);
  const processMs = performance.now() - inicio;
  clearInterval(amostrador);
  picoRss = Math.max(picoRss, process.memoryUsage.rss());

  fs.mkdirSync(PASTAS.outputs, { recursive: true });
  fs.writeFileSync(arquivoResposta(n), JSON.stringify(encontros, null, 2), 'utf8');
  const totalMs = performance.now() - inicio;

  const breakdown: Record<EncounterType, number> = { generico: 0, faccao: 0, protetiva: 0 };
  for (const e of encontros) breakdown[e.tipo]++;

  return {
    encontros,
    metricas: {
      dataset: n,
      sizeBytes: tamanho,
      ...detector.lastRun,
      encounters: encontros.length,
      peakRssBytes: picoRss,
      processMs,
      totalMs,
      breakdown,
      executedAt: new Date().toISOString()
    }
  };
}

/** Resumo das falhas de coleta em uma linha, ou '' se não houver nenhuma. */
export function resumoFalhas(m: RunMetrics): string {
  return (Object.entries(m.falhas) as [TipoFalha, { total: number }][])
    .filter(([, f]) => f.total > 0)
    .map(([t, f]) => `${f.total} ${NOMES_FALHA[t]}`)
    .join(', ');
}
