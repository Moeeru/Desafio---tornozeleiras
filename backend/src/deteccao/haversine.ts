/**
 * Constante oficial do raio da Terra definida pelo desafio: 6.371.000 metros.
 */
export const DEFAULT_EARTH_RADIUS_METERS = 6371000;

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

export function isWithinBoundingBox(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): boolean {
  if (Math.abs(lat1 - lat2) > MAX_DELTA_LAT) return false;
  if (Math.abs(lon1 - lon2) > MAX_DELTA_LON) return false;
  return true;
}

