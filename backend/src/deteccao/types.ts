export type EncounterType = 'generico' | 'faccao' | 'protetiva';

export interface Coordinate {
  lat: number;
  lon: number;
}

export interface MonitoredEntity {
  id: number;
  faccao: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  medidaProtetiva: boolean;
  idsRestricaoMedida: number[];
}

export interface Encounter {
  tipo: EncounterType;
  monitoradosEncontro: [number, number];
  timestamp: string;
  posicoes: {
    [id: string]: Coordinate;
  };
  distanciaMetros: number;
}

export interface DetectorOptions {
  distanceThresholdMeters?: number;
  earthRadiusMeters?: number;
}

export interface ProcessingResult {
  datasetName: string;
  filePath: string;
  outputPath: string;
  encounters: Encounter[];
  durationMs: number;
  breakdown: Record<EncounterType, number>;
}

import type { Falha, Funil, TipoFalha } from '../../../shared/contrato';

/** Auditoria de qualidade de um arquivo de entrada. */
export interface DataQuality {
  /** Caminho dos registros até o encontro. */
  funil: Funil;
  /** Falhas de coleta por tipo, com exemplos. */
  falhas: Partial<Record<TipoFalha, Falha>>;
  /** Linhas válidas lidas. */
  records: number;
  /** Instantes distintos. */
  timestamps: number;
  /** Pessoas distintas. */
  distinctIds: number;
  /** Linhas não vazias (fora o cabeçalho) que não puderam ser interpretadas. */
  discarded: number;
  /** Trocas de instante em que o novo timestamp é anterior ao anterior. */
  outOfOrder: number;
  /** Instantes que reaparecem depois de outro instante (bloco não contíguo). */
  nonContiguous: number;
  /** Mesmo id mais de uma vez no mesmo instante. */
  duplicates: number;
}

/** Métricas de uma execução, persistidas para o painel BI. */
export interface RunMetrics extends DataQuality {
  dataset: number;
  sizeBytes: number;
  encounters: number;
  /** Maior RSS do processo observado durante o processamento do arquivo. */
  peakRssBytes: number;
  /** Leitura + detecção. */
  processMs: number;
  /** Leitura + detecção + gravação do JSON. */
  totalMs: number;
  breakdown: Record<EncounterType, number>;
  executedAt: string;
}

