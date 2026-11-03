import { CONFIG } from '../config';

/**
 * Raio da Terra (deteccao.raioTerraMetros em radar.config.json; o desafio define 6.371.000 m).
 */
export const DEFAULT_EARTH_RADIUS_METERS = CONFIG.deteccao.raioTerraMetros;

/** Distância limite de um encontro (deteccao.distanciaLimiteMetros; o desafio define 20 m). */
export const DEFAULT_DISTANCE_THRESHOLD_METERS = CONFIG.deteccao.distanciaLimiteMetros;

/**
 * Conversão de graus para radianos.
 */
const TO_RAD = Math.PI / 180;

/**
 * Calcula a distância entre dois pontos geográficos na superfície terrestre
 * utilizando a Fórmula de Haversine.
 *
 * @param lat1 Latitude do primeiro ponto em graus decimais
 * @param lon1 Longitude do primeiro ponto em graus decimais
 * @param lat2 Latitude do segundo ponto em graus decimais
 * @param lon2 Longitude do segundo ponto em graus decimais
 * @param radius Raio da Terra em metros (padrão: 6.371.000m)
 * @returns Distância geodésica em metros
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radius: number = DEFAULT_EARTH_RADIUS_METERS
): number {
  const phi1 = lat1 * TO_RAD;
  const phi2 = lat2 * TO_RAD;
  const deltaPhi = (lat2 - lat1) * TO_RAD;
  const deltaLambda = (lon2 - lon1) * TO_RAD;

  const sinHalfDeltaPhi = Math.sin(deltaPhi / 2);
  const sinHalfDeltaLambda = Math.sin(deltaLambda / 2);

  const a =
    sinHalfDeltaPhi * sinHalfDeltaPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinHalfDeltaLambda * sinHalfDeltaLambda;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radius * c;
}

/**
 * Pré-filtro espacial ultra-rápido via Bounding Box delimitador.
 *
 * 1 grau de latitude equivale a ~111.195 metros em qualquer ponto da Terra.
 * Para uma distância limite de 20 metros:
 *   deltaLat máximo = 20 / 111195 ≈ 0.00018 graus.
 *
 * Adotamos margens de segurança generosas:
 *   maxDeltaLat = 0.00025 graus (equivalente a ~27.8 metros)
 *   maxDeltaLon = 0.00035 graus (equivalente a ~38.9 metros no equador e >25m em latitudes altas brasileiras)
 *
 * Se a diferença de latitude ou longitude for maior que essas margens,
 * a distância real NUNCA poderá ser inferior a 20 metros, permitindo
 * descartar pares sem realizar cálculos trigonométricos custosos.
 */
export const MAX_DELTA_LAT = 0.00025;
export const MAX_DELTA_LON = 0.00035;
/** Distância para a qual MAX_DELTA_LAT/LON foram calibradas. */
const LIMITE_CALIBRADO_METROS = 20;

export interface MargensPreFiltro { lat: number; lon: number }

/**
 * Margens do pré-filtro para outra distância limite: as de 20 m escaladas na mesma proporção,
 * o que mantém a folga (~1,39× na latitude) e a latitude segura (≈ 59°). Para 20 m o fator é
 * exatamente 1, então os valores são idênticos às constantes.
 */
export function margensPreFiltro(limiteMetros = DEFAULT_DISTANCE_THRESHOLD_METERS): MargensPreFiltro {
  const f = limiteMetros / LIMITE_CALIBRADO_METROS;
  return { lat: MAX_DELTA_LAT * f, lon: MAX_DELTA_LON * f };
}

const MARGENS_PADRAO = margensPreFiltro();

export function isWithinBoundingBox(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  margens: MargensPreFiltro = MARGENS_PADRAO
): boolean {
  if (Math.abs(lat1 - lat2) > margens.lat) return false;
  if (Math.abs(lon1 - lon2) > margens.lon) return false;
  return true;
}

