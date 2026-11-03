import fs from 'fs';
import readline from 'readline';
import { MonitoredEntity } from './types';

/**
 * Faz o parsing eficiente de uma linha de posicionamento sem alocações desnecessárias.
 * Formato esperado:
 * idMonitorado;faccaoMonitorado;timestamp;latitude;longitude;medidaProtetiva;idsRestricaoMedida
 */
export function parseLine(line: string): MonitoredEntity | null {
  // Ignora cabeçalhos ou linhas vazias
  if (!line || line.charCodeAt(0) === 105) { // 'i' de 'idMonitorado'
    return null;
  }

  const p1 = line.indexOf(';');
  if (p1 === -1) return null;
  const p2 = line.indexOf(';', p1 + 1);
  if (p2 === -1) return null;
  const p3 = line.indexOf(';', p2 + 1);
  if (p3 === -1) return null;
  const p4 = line.indexOf(';', p3 + 1);
  if (p4 === -1) return null;
  const p5 = line.indexOf(';', p4 + 1);
  if (p5 === -1) return null;
  const p6 = line.indexOf(';', p5 + 1);

  const id = parseInt(line.substring(0, p1), 10);
  const faccao = line.substring(p1 + 1, p2).replace(/"/g, '').trim();
  const timestamp = line.substring(p2 + 1, p3).replace(/"/g, '').trim();
  const latitude = parseFloat(line.substring(p3 + 1, p4));
  const longitude = parseFloat(line.substring(p4 + 1, p5));

  const protetivaRaw = p6 === -1
    ? line.substring(p5 + 1)
    : line.substring(p5 + 1, p6);
  const medidaProtetiva = protetivaRaw.trim().toLowerCase() === 'true';

  let idsRestricaoMedida: number[] = [];
  if (p6 !== -1) {
    const restStr = line.substring(p6 + 1);
    if (restStr) {
      idsRestricaoMedida = restStr
        .replace(/"/g, '')
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));
    }
  }

  return {
    id,
    faccao,
    timestamp,
    latitude,
    longitude,
    medidaProtetiva,
    idsRestricaoMedida
  };
}

/**
 * Cria uma interface de leitura em streaming assíncrono para datasets de grande porte.
 * O buffer de 1MB permite alta taxa de transferência I/O do disco.
 */
export function createDatasetStream(filePath: string): readline.Interface {
  const fileStream = fs.createReadStream(filePath, {
    highWaterMark: 1024 * 1024 // 1 MB buffer
  });
  return readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
}

