import {
  Coordinate,
  DetectorOptions,
  Encounter,
  MonitoredEntity
} from './types';
import {
  DEFAULT_EARTH_RADIUS_METERS,
  haversineDistance,
  isWithinBoundingBox
} from './haversine';
import { classifyEncounter } from './classifier';
import { createDatasetStream, parseLine } from './streamParser';

export class EncounterDetector {
  private readonly distanceThreshold: number;
  private readonly earthRadius: number;

  constructor(options?: DetectorOptions) {
    this.distanceThreshold = options?.distanceThresholdMeters ?? 20;
    this.earthRadius = options?.earthRadiusMeters ?? DEFAULT_EARTH_RADIUS_METERS;
  }

  /**
   * Processa uma lista de entidades pertencentes a um mesmo timestamp
   * e detecta encontros físicos respeitando as regras de unicidade e tipagem.
   */
  public detectInTimestamp(
    entities: MonitoredEntity[],
    timestamp: string
  ): Encounter[] {
    const len = entities.length;
    if (len < 2) return [];

    const encounters: Encounter[] = [];

    for (let i = 0; i < len; i++) {
      const p1 = entities[i];

      for (let j = i + 1; j < len; j++) {
        const p2 = entities[j];

        // 1. Pré-filtro espacial ultra-rápido via Bounding Box
        if (!isWithinBoundingBox(p1.latitude, p1.longitude, p2.latitude, p2.longitude)) {
          continue;
        }

        // 2. Cálculo geodésico rigoroso via Fórmula de Haversine
        const distance = haversineDistance(
          p1.latitude,
          p1.longitude,
          p2.latitude,
          p2.longitude,
          this.earthRadius
        );

        // 3. Critério de proximidade estrita: distância menor que 20 metros
        if (distance < this.distanceThreshold) {
          // 4. Classificação de regras de negócio
          const tipo = classifyEncounter(p1, p2);
          if (!tipo) {
            continue;
          }

          // Unicidade e ordenação canônica dos IDs envolvidos
          const idA = p1.id;
          const idB = p2.id;
          const monitoradosEncontro: [number, number] =
            idA < idB ? [idA, idB] : [idB, idA];

          const posicoes: { [id: string]: Coordinate } = {
            [p1.id.toString()]: { lat: p1.latitude, lon: p1.longitude },
            [p2.id.toString()]: { lat: p2.latitude, lon: p2.longitude }
          };

          encounters.push({
            tipo,
            monitoradosEncontro,
            timestamp,
            posicoes,
            distanciaMetros: distance
          });
        }
      }
    }

    return encounters;
  }

  /**
   * Processa um arquivo de dataset em streaming completo de ponta a ponta.
   * Não carrega o arquivo inteiro em memória, possibilitando processar datasets
   * de centenas de megabytes com consumo de RAM inferior a 50 MB.
   */
  public async processFile(filePath: string): Promise<Encounter[]> {
    const rl = createDatasetStream(filePath);

    let currentTimestamp = '';
    let currentBatch: MonitoredEntity[] = [];
    const allEncounters: Encounter[] = [];

    for await (const line of rl) {
      const entity = parseLine(line);
      if (!entity) continue;

      if (entity.timestamp !== currentTimestamp) {
        if (currentBatch.length > 1) {
          const batchEncounters = this.detectInTimestamp(
            currentBatch,
            currentTimestamp
          );
          if (batchEncounters.length > 0) {
            allEncounters.push(...batchEncounters);
          }
        }
        currentTimestamp = entity.timestamp;
        currentBatch = [];
      }

      currentBatch.push(entity);
    }

    if (currentBatch.length > 1) {
      const batchEncounters = this.detectInTimestamp(
        currentBatch,
        currentTimestamp
      );
      if (batchEncounters.length > 0) {
        allEncounters.push(...batchEncounters);
      }
    }

    return allEncounters;
  }
}

