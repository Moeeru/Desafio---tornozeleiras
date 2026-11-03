import fs from 'fs';
import path from 'path';
import { EncounterDetector } from '../detector';
import { haversineDistance, isWithinBoundingBox, DEFAULT_EARTH_RADIUS_METERS } from '../haversine';
import { classifyEncounter } from '../classifier';
import { Encounter, MonitoredEntity } from '../types';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n--- INICIANDO TESTES UNITÁRIOS E DE INTEGRAÇÃO ---\n');

  // Teste 1: Cálculo de Haversine
  console.log('1. Teste de Precisão da Fórmula de Haversine:');
  const dZero = haversineDistance(0, 0, 0, 0);
  assert(dZero === 0, 'Distância entre pontos idênticos deve ser 0');

  // 1 grau de latitude no equador: 2 * PI * 6371000 / 360 ≈ 111194.9266m
  const d1DegLat = haversineDistance(0, 0, 1, 0);
  assert(Math.abs(d1DegLat - 111194.9266) < 0.1, `1 grau de latitude deve ser ~111.195m (obtido: ${d1DegLat.toFixed(2)}m)`);

  // Teste 2: Pré-filtro Bounding Box
  console.log('\n2. Teste de Segurança do Bounding Box:');
  // Ponto a 15 metros (~0.000135 graus de latitude)
  const latBase = -23.55052;
  const lonBase = -46.63330;
  const latClose = latBase + 0.000135;
  const distClose = haversineDistance(latBase, lonBase, latClose, lonBase);
  assert(distClose < 20, `Ponto de teste está a ${distClose.toFixed(2)}m (< 20m)`);
  assert(isWithinBoundingBox(latBase, lonBase, latClose, lonBase) === true, 'Bounding box NÃO deve filtrar pontos dentro do raio de 20m');

  // Ponto a 100 metros
  const latFar = latBase + 0.001;
  assert(isWithinBoundingBox(latBase, lonBase, latFar, lonBase) === false, 'Bounding box DEVE filtrar pontos distantes com segurança');

  // Teste 3: Regras de Negócio e Classificação
  console.log('\n3. Teste das Regras de Classificação e Prioridade:');

  const pMonitoradoA: MonitoredEntity = {
    id: 1,
    faccao: 'CV',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: false,
    idsRestricaoMedida: []
  };

  const pMonitoradoB: MonitoredEntity = {
    id: 2,
    faccao: 'CV',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: false,
    idsRestricaoMedida: []
  };

  const pMonitoradoC: MonitoredEntity = {
    id: 3,
    faccao: 'PCC',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: false,
    idsRestricaoMedida: []
  };

  const pMonitoradoSemFaccao: MonitoredEntity = {
    id: 4,
    faccao: '',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: false,
    idsRestricaoMedida: []
  };

  const pVitima: MonitoredEntity = {
    id: 10,
    faccao: '',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: true,
    idsRestricaoMedida: [1] // restrição contra id 1
  };

  const pOutraVitima: MonitoredEntity = {
    id: 11,
    faccao: '',
    timestamp: '2024-01-01 00:00:00',
    latitude: 0,
    longitude: 0,
    medidaProtetiva: true,
    idsRestricaoMedida: [2]
  };

  assert(classifyEncounter(pMonitoradoA, pMonitoradoB) === 'faccao', 'Dois monitorados da mesma facção devem gerar encontro "faccao"');
  assert(classifyEncounter(pMonitoradoA, pMonitoradoC) === 'generico', 'Dois monitorados de facções diferentes devem gerar encontro "generico"');
  assert(classifyEncounter(pMonitoradoA, pMonitoradoSemFaccao) === 'generico', 'Monitorado com facção e monitorado sem facção devem gerar encontro "generico"');
  assert(classifyEncounter(pVitima, pMonitoradoA) === 'protetiva', 'Vítima e seu respectivo agressor restrito devem gerar encontro "protetiva"');
  assert(classifyEncounter(pMonitoradoA, pVitima) === 'protetiva', 'Ordem dos parâmetros não deve alterar classificação "protetiva"');
  assert(classifyEncounter(pVitima, pMonitoradoB) === null, 'Vítima e monitorado que não consta na restrição NÃO devem gerar encontro (retorna null)');
  assert(classifyEncounter(pVitima, pOutraVitima) === null, 'Encontro entre duas vítimas NÃO deve gerar encontro (retorna null)');

  // Teste 4: Validação contra Respostas Oficiais Esperadas
  console.log('\n4. Teste de Validação com os Datasets Oficiais de Teste:');
  const detector = new EncounterDetector();
  const rootDir = path.resolve(__dirname, '../..');

  // Dataset 1
  const ds1Path = path.join(rootDir, 'Inputs', 'dataset1.txt');
  const exp1Path = path.join(rootDir, 'Respostas esperadas', 'respostas1.json');
  if (fs.existsSync(ds1Path) && fs.existsSync(exp1Path)) {
    const gen1 = await detector.processFile(ds1Path);
    const exp1: Encounter[] = JSON.parse(fs.readFileSync(exp1Path, 'utf8'));

    assert(gen1.length === exp1.length, `Dataset 1: Quantidade de encontros deve ser ${exp1.length} (obtido: ${gen1.length})`);

    let matchAll1 = true;
    for (const expected of exp1) {
      const match = gen1.find(g =>
        g.timestamp === expected.timestamp &&
        g.monitoradosEncontro[0] === expected.monitoradosEncontro[0] &&
        g.monitoradosEncontro[1] === expected.monitoradosEncontro[1]
      );
      if (!match) {
        matchAll1 = false;
        break;
      }
      if (match.tipo !== expected.tipo) matchAll1 = false;
      if (Math.abs(match.distanciaMetros - expected.distanciaMetros) > 1e-6) matchAll1 = false;
    }
    assert(matchAll1, 'Dataset 1: Todos os encontros, tipos e distâncias coincidem com o gabarito oficial');
  }

  // Dataset 2
  const ds2Path = path.join(rootDir, 'Inputs', 'dataset2.txt');
  const exp2Path = path.join(rootDir, 'Respostas esperadas', 'respostas2.json');
  if (fs.existsSync(ds2Path) && fs.existsSync(exp2Path)) {
    const gen2 = await detector.processFile(ds2Path);
    const exp2: Encounter[] = JSON.parse(fs.readFileSync(exp2Path, 'utf8'));

    assert(gen2.length === exp2.length, `Dataset 2: Quantidade de encontros deve ser ${exp2.length} (obtido: ${gen2.length})`);

    let matchAll2 = true;
    for (const expected of exp2) {
      const match = gen2.find(g =>
        g.timestamp === expected.timestamp &&
        g.monitoradosEncontro[0] === expected.monitoradosEncontro[0] &&
        g.monitoradosEncontro[1] === expected.monitoradosEncontro[1]
      );
      if (!match) {
        matchAll2 = false;
        break;
      }
      if (match.tipo !== expected.tipo) matchAll2 = false;
      if (Math.abs(match.distanciaMetros - expected.distanciaMetros) > 1e-6) matchAll2 = false;
    }
    assert(matchAll2, 'Dataset 2: Todos os encontros, tipos e distâncias coincidem com o gabarito oficial');
  }

  console.log('\n======================================================');
  console.log(`TOTAL DE TESTES: ${passedTests + failedTests} | PASSARAM: ${passedTests} | FALHARAM: ${failedTests}`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Erro nos testes:', err);
  process.exit(1);
});

