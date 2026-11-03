import { EncounterType, MonitoredEntity } from './types';

/**
 * Classifica a natureza do encontro entre duas entidades segundo as regras de negócio:
 *
 * 1. Encontro de medidas protetivas ('protetiva'):
 *    Ocorre entre um agressor e sua respectiva vítima (uma entidade possui medida protetiva
 *    e a outra consta expressamente em sua lista de restrição).
 *
 * 2. Vítimas não relacionadas:
 *    Se uma das entidades for vítima (medidaProtetiva = true) e a outra NÃO for seu agressor
 *    designado (ou ambas forem vítimas), NÃO se configura encontro penal/relevante, retornando null.
 *
 * 3. Encontro de facções ('faccao'):
 *    Ocorre entre dois indivíduos monitorados que pertencem comprovadamente à mesma facção
 *    (ambos com faccao preenchida e idêntica).
 *
 * 4. Encontro genérico ('generico'):
 *    Encontro entre quaisquer dois indivíduos monitorados que não se enquadram nas categorias anteriores.
 *
 * @param p1 Primeira entidade envolvida
 * @param p2 Segunda entidade envolvida
 * @returns Tipo de encontro ou null caso a aproximação não constitua encontro de interesse
 */
export function classifyEncounter(
  p1: MonitoredEntity,
  p2: MonitoredEntity
): EncounterType | null {
  const isP1Victim = p1.medidaProtetiva;
  const isP2Victim = p2.medidaProtetiva;

  // Regra 1: Medida Protetiva (Vítima + Agressor restrito)
  const isProtectiveEncounter =
    (isP1Victim && p1.idsRestricaoMedida.includes(p2.id)) ||
    (isP2Victim && p2.idsRestricaoMedida.includes(p1.id));

  if (isProtectiveEncounter) {
    return 'protetiva';
  }

  // Regra 2: Se envolve vítima mas não é o agressor restrito, desconsidera
  if (isP1Victim || isP2Victim) {
    return null;
  }

  // Regra 3: Mesma facção
  if (p1.faccao && p2.faccao && p1.faccao === p2.faccao) {
    return 'faccao';
  }

  // Regra 4: Encontro genérico entre monitorados
  return 'generico';
}

