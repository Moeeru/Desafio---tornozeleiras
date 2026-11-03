import fs from 'fs';
import type { Funil } from '../../../shared/contrato';
import { Auditoria, detach } from './auditoria';
import { classifyEncounter } from './classifier';
import { DEFAULT_EARTH_RADIUS_METERS, MAX_DELTA_LAT, MAX_DELTA_LON, haversineDistance } from './haversine';
import { COMPLEXA, INVALIDA, bytesIguais, lerLinhaBytes, posTs } from './leituraBytes';
import { createDatasetStream, parseLine } from './streamParser';
import type { Coordinate, DataQuality, DetectorOptions, Encounter, MonitoredEntity } from './types';

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const MAIOR_ID_EM_ARRAY = 10_000_000;

/** "2024-01-01 00:05:15" -> 20240101000515 (ordem numérica = ordem cronológica). */
export function timestampKey(ts: string): number {
  let k = 0;
  for (let i = 0; i < ts.length; i++) {
    const c = ts.charCodeAt(i);
    if (c >= 48 && c <= 57) k = k * 10 + (c - 48);
  }
  return k;
}

export function funilVazio(): Funil {
  return {
    linhasLidas: 0, cabecalhos: 0, registrosValidos: 0, registrosDescartados: 0, instantes: 0,
    paresComparados: 0, paresPreFiltro: 0, paresProximos: 0, paresIgnorados: 0, encontros: 0,
    registrosCandidatos: 0, registrosEmEncontro: 0
  };
}

function qualidadeVazia(): DataQuality {
  return {
    records: 0, timestamps: 0, distinctIds: 0, discarded: 0, outOfOrder: 0, nonContiguous: 0, duplicates: 0,
    funil: funilVazio(), falhas: {}
  };
}

export class EncounterDetector {
  private readonly distanceThreshold: number;
  private readonly earthRadius: number;
  /** Marcas por registro do lote atual (reaproveitadas entre lotes para não alocar). */
  private marcaCandidato = new Uint8Array(256);
  private marcaEncontro = new Uint8Array(256);
  /** Coordenadas do lote atual copiadas para arrays numéricos (o laço de pares lê só daqui). */
  private latLote = new Float64Array(256);
  private lonLote = new Float64Array(256);

  /** Contadores, funil e falhas do último arquivo processado (usados no BI). */
  public lastRun: DataQuality = qualidadeVazia();

  constructor(options?: DetectorOptions) {
    this.distanceThreshold = options?.distanceThresholdMeters ?? 20;
    this.earthRadius = options?.earthRadiusMeters ?? DEFAULT_EARTH_RADIUS_METERS;
  }

  /**
   * Detecta os encontros entre as entidades de um mesmo instante.
   * Se `funil` for passado, acumula nele quantos pares e registros passaram por cada etapa.
   */
  public detectInTimestamp(entities: MonitoredEntity[], timestamp: string, funil: Funil = funilVazio()): Encounter[] {
    const len = entities.length;
    if (len < 2) return [];
    funil.paresComparados += (len * (len - 1)) / 2;

    if (this.marcaCandidato.length < len) {
      this.marcaCandidato = new Uint8Array(len * 2);
      this.marcaEncontro = new Uint8Array(len * 2);
      this.latLote = new Float64Array(len * 2);
      this.lonLote = new Float64Array(len * 2);
    }
    const cand = this.marcaCandidato, enc = this.marcaEncontro;
    const lats = this.latLote, lons = this.lonLote;
    cand.fill(0, 0, len);
    enc.fill(0, 0, len);
    for (let k = 0; k < len; k++) { lats[k] = entities[k].latitude; lons[k] = entities[k].longitude; }
    let algumCandidato = false;

    const encounters: Encounter[] = [];
    for (let i = 0; i < len; i++) {
      const lat1 = lats[i], lon1 = lons[i];
      for (let j = i + 1; j < len; j++) {
        // 1. Pré-filtro espacial barato: descarta pares comprovadamente a mais de 20 m.
        //    É a mesma conta de isWithinBoundingBox, escrita direto no laço (714 milhões de pares no dataset 7).
        if (Math.abs(lat1 - lats[j]) > MAX_DELTA_LAT) continue;
        if (Math.abs(lon1 - lons[j]) > MAX_DELTA_LON) continue;
        const p1 = entities[i], p2 = entities[j];
        funil.paresPreFiltro++;
        cand[i] = 1;
        cand[j] = 1;
        algumCandidato = true;

        // 2. Distância geodésica pela fórmula de Haversine
        const distance = haversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude, this.earthRadius);

        // 3. Critério estrito: menos de 20 metros
        if (!(distance < this.distanceThreshold)) continue;
        funil.paresProximos++;

        // 4. Regras de negócio
        const tipo = classifyEncounter(p1, p2);
        if (!tipo) {
          funil.paresIgnorados++;
          continue;
        }
        enc[i] = 1;
        enc[j] = 1;
        funil.encontros++;

        const idA = p1.id, idB = p2.id;
        const posicoes: { [id: string]: Coordinate } = {
          [idA.toString()]: { lat: p1.latitude, lon: p1.longitude },
          [idB.toString()]: { lat: p2.latitude, lon: p2.longitude }
        };
        encounters.push({
          tipo,
          monitoradosEncontro: idA < idB ? [idA, idB] : [idB, idA],
          timestamp: detach(timestamp),
          posicoes,
          distanciaMetros: distance
        });
      }
    }

    if (algumCandidato) {
      for (let k = 0; k < len; k++) {
        funil.registrosCandidatos += cand[k];
        funil.registrosEmEncontro += enc[k];
      }
    }
    return encounters;
  }

  /**
   * Processa um arquivo lendo blocos de 16 MB e interpretando os bytes direto (leituraBytes.ts),
   * sem criar uma string por linha. Só o lote do instante atual fica em memória, e os objetos das
   * entidades são reaproveitados entre lotes. Ao mesmo tempo, audita a coleta e monta o funil.
   *
   * Tem o mesmo resultado de processFileReadline (encontros, falhas e funil), verificado pelos
   * testes; linhas fora do formato comum usam o mesmo parseLine dela.
   */
  public async processFile(filePath: string): Promise<Encounter[]> {
    const fh = await fs.promises.open(filePath, 'r');
    try {
      return await this.processarBytes(fh);
    } finally {
      await fh.close();
    }
  }

  private async processarBytes(fh: fs.promises.FileHandle): Promise<Encounter[]> {
    const aud = new Auditoria();
    const funil = funilVazio();
    const allEncounters: Encounter[] = [];
    const cacheFaccao = new Map<number, string>();

    let currentTimestamp = '';
    let tsBytes = Buffer.alloc(0);
    // Lote do instante atual e objetos livres para reaproveitar (nenhuma alocação por linha)
    const lote: MonitoredEntity[] = [];
    const livres: MonitoredEntity[] = [];
    const novaEntidade = (): MonitoredEntity =>
      ({ id: 0, faccao: '', timestamp: '', latitude: 0, longitude: 0, medidaProtetiva: false, idsRestricaoMedida: [] });
    let ent = novaEntidade();

    let lineNo = 0;
    let distinctIds = 0;
    let batchNo = 0;
    let currentTsKey = -1;
    const seenTs = new Set<number>();
    let ultimoLote = new Int32Array(1024);
    let presencas = new Int32Array(1024);
    const ultimoLoteGrande = new Map<number, number>();
    const presencasGrande = new Map<number, number>();
    const vitimasVistas = new Set<number>();
    const restricoes: { vitima: number; linha: number; conteudo: string; ids: number[] }[] = [];

    const BLOCO = 16 << 20;
    let buf = Buffer.allocUnsafe(BLOCO + 65536);
    let carry = 0;

    for (;;) {
      // Lê de forma assíncrona: entre um bloco e outro o laço de eventos roda (amostrador de memória)
      const { bytesRead } = await fh.read(buf, carry, buf.length - carry, null);
      const len = carry + bytesRead;
      if (len === 0) break;
      let end = len;
      if (bytesRead > 0) {
        end = buf.lastIndexOf(10, len - 1) + 1;
        if (end === 0) { // nenhuma quebra de linha no buffer: linha enorme, aumenta o buffer
          if (len >= buf.length) { const maior = Buffer.allocUnsafe(buf.length * 2); buf.copy(maior, 0, 0, len); buf = maior; }
          carry = len;
          continue;
        }
      }

      let p = 0;
      while (p < end) {
        // Busca da quebra de linha em JS: as linhas são curtas, e chamar buf.indexOf a cada uma custa mais
        let q = p;
        while (q < end && buf[q] !== 10) q++;
        let e = q;
        if (e > p && buf[e - 1] === 13) e--;
        const inicioLinha = p;
        p = q + 1;
        lineNo++;
        if (e === inicioLinha) continue; // linha vazia
        funil.linhasLidas++;

        let s = inicioLinha;
        if (lineNo === 1 && e - s >= 3 && buf[s] === 0xef && buf[s + 1] === 0xbb && buf[s + 2] === 0xbf) s += 3; // BOM
        if (lineNo === 1 && s < e && buf[s] === 105) { // 'i' de idMonitorado
          funil.cabecalhos++;
          continue;
        }

        let texto: string | null = null; // a linha decodificada, só quando precisa (falha ou formato incomum)
        let tsStr: string | null = null; // timestamp decodificado (caminho COMPLEXA); senão está em posTs
        let cod = s < e && buf[s] === 105 ? INVALIDA : lerLinhaBytes(buf, s, e, ent, cacheFaccao);
        if (cod === COMPLEXA) {
          texto = buf.toString('utf8', s, e);
          const r = parseLine(texto);
          if (!r) cod = INVALIDA;
          else {
            ent.id = r.id; ent.faccao = r.faccao; ent.latitude = r.latitude; ent.longitude = r.longitude;
            ent.medidaProtetiva = r.medidaProtetiva;
            ent.idsRestricaoMedida.length = 0;
            for (const x of r.idsRestricaoMedida) ent.idsRestricaoMedida.push(x);
            tsStr = r.timestamp;
          }
        }
        if (cod === INVALIDA) {
          texto ??= buf.toString('utf8', s, e);
          aud.registrar('linha_invalida', lineNo, texto, texto.charCodeAt(0) === 105
            ? 'cabeçalho repetido no meio do arquivo'
            : 'esperados 7 campos separados por ";"');
          funil.registrosDescartados++;
          continue;
        }
        const id = ent.id;
        if (!Number.isFinite(id)) {
          aud.registrar('id_invalido', lineNo, texto ?? buf.toString('utf8', s, e), 'o primeiro campo precisa ser um número inteiro');
          funil.registrosDescartados++;
          continue;
        }
        const lat = ent.latitude, lon = ent.longitude;
        if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) {
          aud.registrar('coordenada_invalida', lineNo, texto ?? buf.toString('utf8', s, e), 'latitude precisa estar entre −90 e 90 e longitude entre −180 e 180');
          funil.registrosDescartados++;
          continue;
        }

        const mudou = batchNo === 0 || (tsStr === null ? !bytesIguais(buf, posTs.ini, posTs.fim, tsBytes) : tsStr !== currentTimestamp);
        if (mudou) {
          const ts = tsStr ?? buf.toString('latin1', posTs.ini, posTs.fim);
          if (!TIMESTAMP_RE.test(ts)) {
            aud.registrar('timestamp_invalido', lineNo, texto ?? buf.toString('utf8', s, e), `"${ts}" não segue o formato AAAA-MM-DD HH:MM:SS`);
          }
          const tsKey = timestampKey(ts);
          if (currentTsKey !== -1 && tsKey < currentTsKey) {
            aud.registrar('fora_de_ordem', lineNo, texto ?? buf.toString('utf8', s, e), `o instante ${ts} veio depois de ${currentTimestamp}`);
          }
          if (seenTs.has(tsKey)) {
            aud.registrar('instante_repetido', lineNo, texto ?? buf.toString('utf8', s, e), `o instante ${ts} já tinha aparecido antes; as leituras dele ficam em lotes separados e encontros entre os lotes não são detectados`);
          } else {
            seenTs.add(tsKey);
          }
          currentTsKey = tsKey;
          if (lote.length > 1) {
            const found = this.detectInTimestamp(lote, currentTimestamp, funil);
            if (found.length > 0) allEncounters.push(...found);
          }
          for (let k = 0; k < lote.length; k++) livres.push(lote[k]);
          lote.length = 0;
          batchNo++;
          currentTimestamp = ts;
          tsBytes = Buffer.from(ts, 'utf8');
        }

        let duplicada = false;
        if (id >= 0 && id < MAIOR_ID_EM_ARRAY) {
          if (id >= ultimoLote.length) {
            const tam = Math.max(id + 1, ultimoLote.length * 2);
            const a = new Int32Array(tam); a.set(ultimoLote); ultimoLote = a;
            const b = new Int32Array(tam); b.set(presencas); presencas = b;
          }
          const prev = ultimoLote[id];
          if (prev === 0) distinctIds++;
          if (prev === batchNo) duplicada = true;
          else { ultimoLote[id] = batchNo; presencas[id]++; }
        } else {
          const prev = ultimoLoteGrande.get(id);
          if (prev === undefined) distinctIds++;
          if (prev === batchNo) duplicada = true;
          else { ultimoLoteGrande.set(id, batchNo); presencasGrande.set(id, (presencasGrande.get(id) ?? 0) + 1); }
        }
        if (duplicada) {
          aud.registrar('leitura_duplicada', lineNo, texto ?? buf.toString('utf8', s, e), `o id ${id} já tem posição no instante ${currentTimestamp}; a repetição foi ignorada`);
          funil.registrosDescartados++;
          continue;
        }

        if (ent.medidaProtetiva) {
          if (ent.faccao) aud.registrar('cadastro_inconsistente', lineNo, texto ?? buf.toString('utf8', s, e), 'vítima com facção preenchida; só monitorados têm facção');
          if (!vitimasVistas.has(id)) {
            vitimasVistas.add(id);
            restricoes.push({ vitima: id, linha: lineNo, conteudo: texto ?? buf.toString('utf8', s, e), ids: [...ent.idsRestricaoMedida] });
          }
        } else if (ent.idsRestricaoMedida.length) {
          aud.registrar('cadastro_inconsistente', lineNo, texto ?? buf.toString('utf8', s, e), 'lista de restrição preenchida em quem não tem medida protetiva');
        }

        funil.registrosValidos++;
        ent.timestamp = currentTimestamp;
        lote.push(ent);
        ent = livres.pop() ?? novaEntidade();
      }

      if (bytesRead === 0) break;
      carry = len - end;
      if (carry > 0) buf.copy(buf, 0, end, len);
    }
    if (lote.length > 1) {
      const found = this.detectInTimestamp(lote, currentTimestamp, funil);
      if (found.length > 0) allEncounters.push(...found);
    }

    this.conferirArquivoInteiro(aud, restricoes, ultimoLote, presencas, ultimoLoteGrande, presencasGrande, batchNo);

    funil.instantes = seenTs.size;
    this.lastRun = {
      records: funil.registrosValidos,
      timestamps: seenTs.size,
      distinctIds,
      discarded: funil.registrosDescartados,
      outOfOrder: aud.total('fora_de_ordem'),
      nonContiguous: aud.total('instante_repetido'),
      duplicates: aud.total('leitura_duplicada'),
      funil,
      falhas: aud.falhas
    };
    return allEncounters;
  }

  /**
   * Versão anterior, com readline e parseLine (uma string por linha). Fica como referência:
   * os testes conferem que processFile dá exatamente o mesmo resultado.
   */
  public async processFileReadline(filePath: string): Promise<Encounter[]> {
    const rl = createDatasetStream(filePath);
    const aud = new Auditoria();
    const funil = funilVazio();

    let currentTimestamp = '';
    let currentBatch: MonitoredEntity[] = [];
    const allEncounters: Encounter[] = [];

    let lineNo = 0;
    let distinctIds = 0;
    let batchNo = 0;
    let currentTsKey = -1;
    // Chave numérica, não a string: as linhas do readline são fatias do bloco lido do disco,
    // e guardar um pedaço delas manteria o bloco inteiro (1 MB) vivo na memória.
    const seenTs = new Set<number>();
    // Por id: último lote em que apareceu (0 = nunca) e em quantos lotes apareceu.
    let ultimoLote = new Int32Array(1024);
    let presencas = new Int32Array(1024);
    const ultimoLoteGrande = new Map<number, number>();
    const presencasGrande = new Map<number, number>();
    // Vítimas: restrições vistas na primeira aparição, conferidas no fim do arquivo.
    const vitimasVistas = new Set<number>();
    const restricoes: { vitima: number; linha: number; conteudo: string; ids: number[] }[] = [];

    // Sem closures neste método: variáveis capturadas por uma função interna deixam de ficar
    // em registrador no V8, e este laço roda uma vez por linha (12 milhões no dataset 7).
    for await (const raw of rl) {
      lineNo++;
      if (!raw) continue;
      funil.linhasLidas++;
      const line = lineNo === 1 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // BOM de editores do Windows
      if (lineNo === 1 && line.charCodeAt(0) === 105) { // 'i' de idMonitorado
        funil.cabecalhos++;
        continue;
      }

      const entity = parseLine(line);
      if (!entity) {
        aud.registrar('linha_invalida', lineNo, line, line.charCodeAt(0) === 105
          ? 'cabeçalho repetido no meio do arquivo'
          : 'esperados 7 campos separados por ";"');
        funil.registrosDescartados++;
        continue;
      }
      const id = entity.id;
      if (!Number.isFinite(id)) {
        aud.registrar('id_invalido', lineNo, line, 'o primeiro campo precisa ser um número inteiro');
        funil.registrosDescartados++;
        continue;
      }
      const lat = entity.latitude, lon = entity.longitude;
      if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) { // NaN também cai aqui
        aud.registrar('coordenada_invalida', lineNo, line, 'latitude precisa estar entre −90 e 90 e longitude entre −180 e 180');
        funil.registrosDescartados++;
        continue;
      }

      if (batchNo === 0 || entity.timestamp !== currentTimestamp) {
        const ts = entity.timestamp;
        if (!TIMESTAMP_RE.test(ts)) {
          aud.registrar('timestamp_invalido', lineNo, line, `"${ts}" não segue o formato AAAA-MM-DD HH:MM:SS`);
        }
        const tsKey = timestampKey(ts);
        if (currentTsKey !== -1 && tsKey < currentTsKey) {
          aud.registrar('fora_de_ordem', lineNo, line, `o instante ${ts} veio depois de ${currentTimestamp}`);
        }
        if (seenTs.has(tsKey)) {
          aud.registrar('instante_repetido', lineNo, line, `o instante ${ts} já tinha aparecido antes; as leituras dele ficam em lotes separados e encontros entre os lotes não são detectados`);
        } else {
          seenTs.add(tsKey);
        }
        currentTsKey = tsKey;
        if (currentBatch.length > 1) {
          const found = this.detectInTimestamp(currentBatch, currentTimestamp, funil);
          if (found.length > 0) allEncounters.push(...found);
        }
        batchNo++;
        currentTimestamp = ts;
        currentBatch = [];
      }

      // Duplicata no mesmo instante: registra e não compara (evitaria um "encontro" do id consigo mesmo)
      let duplicada = false;
      if (id >= 0 && id < MAIOR_ID_EM_ARRAY) {
        if (id >= ultimoLote.length) {
          const tam = Math.max(id + 1, ultimoLote.length * 2);
          const a = new Int32Array(tam); a.set(ultimoLote); ultimoLote = a;
          const b = new Int32Array(tam); b.set(presencas); presencas = b;
        }
        const prev = ultimoLote[id];
        if (prev === 0) distinctIds++;
        if (prev === batchNo) duplicada = true;
        else { ultimoLote[id] = batchNo; presencas[id]++; }
      } else {
        const prev = ultimoLoteGrande.get(id);
        if (prev === undefined) distinctIds++;
        if (prev === batchNo) duplicada = true;
        else { ultimoLoteGrande.set(id, batchNo); presencasGrande.set(id, (presencasGrande.get(id) ?? 0) + 1); }
      }
      if (duplicada) {
        aud.registrar('leitura_duplicada', lineNo, line, `o id ${id} já tem posição no instante ${currentTimestamp}; a repetição foi ignorada`);
        funil.registrosDescartados++;
        continue;
      }

      if (entity.medidaProtetiva) {
        if (entity.faccao) aud.registrar('cadastro_inconsistente', lineNo, line, 'vítima com facção preenchida; só monitorados têm facção');
        if (!vitimasVistas.has(id)) {
          vitimasVistas.add(id);
          restricoes.push({ vitima: id, linha: lineNo, conteudo: detach(line), ids: entity.idsRestricaoMedida });
        }
      } else if (entity.idsRestricaoMedida.length) {
        aud.registrar('cadastro_inconsistente', lineNo, line, 'lista de restrição preenchida em quem não tem medida protetiva');
      }

      funil.registrosValidos++;
      currentBatch.push(entity);
    }
    if (currentBatch.length > 1) {
      const found = this.detectInTimestamp(currentBatch, currentTimestamp, funil);
      if (found.length > 0) allEncounters.push(...found);
    }

    this.conferirArquivoInteiro(aud, restricoes, ultimoLote, presencas, ultimoLoteGrande, presencasGrande, batchNo);

    funil.instantes = seenTs.size;
    this.lastRun = {
      records: funil.registrosValidos,
      timestamps: seenTs.size,
      distinctIds,
      discarded: funil.registrosDescartados,
      outOfOrder: aud.total('fora_de_ordem'),
      nonContiguous: aud.total('instante_repetido'),
      duplicates: aud.total('leitura_duplicada'),
      funil,
      falhas: aud.falhas
    };
    return allEncounters;
  }

  /** Conferências que só fazem sentido com o arquivo inteiro lido. */
  private conferirArquivoInteiro(
    aud: Auditoria,
    restricoes: { vitima: number; linha: number; conteudo: string; ids: number[] }[],
    ultimoLote: Int32Array,
    presencas: Int32Array,
    ultimoLoteGrande: Map<number, number>,
    presencasGrande: Map<number, number>,
    lotes: number
  ): void {
    const existe = (x: number): boolean =>
      x >= 0 && x < MAIOR_ID_EM_ARRAY ? x < ultimoLote.length && ultimoLote[x] !== 0 : ultimoLoteGrande.has(x);
    for (const r of restricoes) {
      for (const alvo of r.ids) {
        if (!existe(alvo)) {
          aud.registrar('restricao_desconhecida', r.linha, r.conteudo, `a vítima ${r.vitima} é protegida contra o id ${alvo}, que não aparece no arquivo`);
        }
      }
    }
    const ausencia = (id: number, presente: number): void => {
      const faltam = lotes - presente;
      if (faltam > 0) aud.registrar('leitura_ausente', null, `id ${id}`, `presente em ${presente} de ${lotes} instantes (faltam ${faltam})`, faltam);
    };
    for (let x = 0; x < ultimoLote.length; x++) if (ultimoLote[x] !== 0) ausencia(x, presencas[x]);
    for (const [x, n] of presencasGrande) ausencia(x, n);
  }
}
