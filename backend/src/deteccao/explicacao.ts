/**
 * Explicação de um único instante: o que aconteceu com cada registro e com cada par.
 * Usa as mesmas funções do detector (parse, pré-filtro, Haversine e classificação), para que
 * o que o BI mostra seja exatamente o que a detecção fez.
 */
import type { InstanteBruto, ParAnalisado, RegistroBruto } from '../../../shared/contrato';
import { classifyEncounter } from './classifier';
import { DEFAULT_DISTANCE_THRESHOLD_METERS, haversineDistance, isWithinBoundingBox, margensPreFiltro } from './haversine';
import { parseLine } from './streamParser';
import type { MonitoredEntity } from './types';

export interface LinhaNumerada { linha: number; texto: string }

export function explicarInstante(
  linhas: LinhaNumerada[],
  limiteMetros = DEFAULT_DISTANCE_THRESHOLD_METERS
): Pick<InstanteBruto, 'registros' | 'pares' | 'resumo'> {
  const margens = margensPreFiltro(limiteMetros);
  const registros: RegistroBruto[] = [];
  const validos: { reg: RegistroBruto; ent: MonitoredEntity }[] = [];
  const vistos = new Set<number>();

  for (const { linha, texto } of linhas) {
    const base: RegistroBruto = { linha, bruto: texto, status: 'descartado' };
    const ent = parseLine(texto);
    if (!ent) { registros.push({ ...base, motivo: 'linha sem os 7 campos esperados' }); continue; }
    if (!Number.isFinite(ent.id)) { registros.push({ ...base, motivo: 'id não numérico' }); continue; }
    if (!(ent.latitude >= -90 && ent.latitude <= 90 && ent.longitude >= -180 && ent.longitude <= 180)) {
      registros.push({ ...base, id: ent.id, motivo: 'coordenada inválida' });
      continue;
    }
    const reg: RegistroBruto = {
      ...base, id: ent.id, faccao: ent.faccao, lat: ent.latitude, lon: ent.longitude,
      vitima: ent.medidaProtetiva, restricoes: ent.idsRestricaoMedida
    };
    if (vistos.has(ent.id)) { registros.push({ ...reg, motivo: 'id repetido neste instante' }); continue; }
    vistos.add(ent.id);
    reg.status = 'valido';
    reg.vizinho = null;
    reg.candidatos = 0;
    reg.encontros = 0;
    registros.push(reg);
    validos.push({ reg, ent });
  }

  const pares: ParAnalisado[] = [];
  let paresPreFiltro = 0, paresProximos = 0, encontros = 0;
  for (let i = 0; i < validos.length; i++) {
    for (let j = i + 1; j < validos.length; j++) {
      const A = validos[i], B = validos[j];
      // Distância real de todos os pares, para mostrar o vizinho mais próximo de cada registro
      const d = haversineDistance(A.ent.latitude, A.ent.longitude, B.ent.latitude, B.ent.longitude);
      for (const [X, Y] of [[A, B], [B, A]] as const) {
        if (!X.reg.vizinho || d < X.reg.vizinho.distancia) X.reg.vizinho = { id: Y.ent.id, distancia: d };
      }
      if (!isWithinBoundingBox(A.ent.latitude, A.ent.longitude, B.ent.latitude, B.ent.longitude, margens)) continue;
      paresPreFiltro++;
      A.reg.candidatos!++;
      B.reg.candidatos!++;
      const [a, b] = A.ent.id < B.ent.id ? [A.ent.id, B.ent.id] : [B.ent.id, A.ent.id];
      let par: ParAnalisado;
      if (!(d < limiteMetros)) {
        par = { a, b, distancia: d, etapa: 'acima_do_limite' };
      } else {
        paresProximos++;
        const tipo = classifyEncounter(A.ent, B.ent);
        if (!tipo) {
          par = { a, b, distancia: d, etapa: 'ignorado_vitima' };
        } else {
          encontros++;
          A.reg.encontros!++;
          B.reg.encontros!++;
          par = { a, b, distancia: d, etapa: 'encontro', tipo };
        }
      }
      pares.push(par);
      // O mesmo par, visto de cada um dos dois registros (para a tabela de dados brutos)
      (A.reg.paresCom ??= []).push({ id: B.ent.id, distancia: d, etapa: par.etapa, tipo: par.tipo });
      (B.reg.paresCom ??= []).push({ id: A.ent.id, distancia: d, etapa: par.etapa, tipo: par.tipo });
    }
  }
  pares.sort((x, y) => x.distancia - y.distancia);
  const n = validos.length;
  return {
    registros,
    pares,
    resumo: {
      registros: registros.length,
      validos: n,
      descartados: registros.length - n,
      paresComparados: (n * (n - 1)) / 2,
      paresPreFiltro,
      paresProximos,
      encontros
    }
  };
}
