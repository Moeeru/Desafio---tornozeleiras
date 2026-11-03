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

