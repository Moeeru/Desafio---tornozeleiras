# Desafio Técnico: Detecção de Encontros de Geolocalização

Solução em **TypeScript / Node.js** que processa posições de monitorados por tornozeleira eletrônica e de vítimas com medida protetiva, e detecta encontros físicos (distância **menor que 20 metros** no **mesmo timestamp**).

Cada encontro é classificado em um de três tipos:

- **`protetiva`**: agressor perto da vítima que tem medida protetiva contra ele.
- **`faccao`**: dois monitorados da mesma facção.
- **`generico`**: quaisquer outros dois monitorados.

O projeto tem duas partes:

- **Backend:** a solução do desafio. Lê os arquivos, detecta os encontros, grava os JSONs de resposta e audita a qualidade da coleta.
- **Frontend:** o **BI**, um painel de análise dos resultados, com abas por assunto, filtros, dados brutos, falhas de coleta e inclusão de novos arquivos.

### Início rápido

```bash
npm install
npm run tudo
```

O `npm run tudo` compila, processa os 7 datasets, roda os testes e abre o BI em **http://localhost:4173**. Para só gerar as respostas do desafio: `npm run build && npm start`. O passo a passo completo está na [seção 4](#4-como-executar).

---

## 1. Resultados

| Dataset | Tamanho | Posições | Instantes | Encontros | Genérico | Facção | Protetiva | Tempo |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| dataset1.txt | 0,2 MB | 5.000 | 500 | **4** | 2 | 1 | 1 | 0,027 s |
| dataset2.txt | 1,2 MB | 25.000 | 1.250 | **6** | 3 | 2 | 1 | 0,029 s |
| dataset3.txt | 5,0 MB | 100.000 | 2.500 | **10** | 5 | 3 | 2 | 0,060 s |
| dataset4.txt | 20,1 MB | 400.020 | 6.667 | **15** | 7 | 5 | 3 | 0,244 s |
| dataset5.txt | 50,4 MB | 1.000.000 | 12.500 | **21** | 10 | 7 | 4 | 0,585 s |
| dataset6.txt | 403,8 MB | 8.000.000 | 80.000 | **27** | 12 | 9 | 6 | 4,921 s |
| dataset7.txt | 608,6 MB | 12.000.000 | 100.000 | **35** | 15 | 12 | 8 | 7,679 s |
| **Total** | **~1,1 GB** | **~21,5 mi** | | **118** | **54** | **39** | **25** | **13,54 s** |

- **Tempo médio por dataset: 1,93 s.** É o tempo de leitura e detecção, medido dentro do processo, sem a inicialização do Node. Medido em Windows 11 com Node 22.2; varia conforme a máquina e o cache de disco. Na mesma máquina, medições em momentos diferentes chegaram a variar quase 2×. Medida lado a lado no mesmo momento, a leitura em bytes atual é 2,2 a 3,5 vezes mais rápida que a versão anterior com `readline` (ver [Decisões](#decisões)).
- **Datasets 1 e 2:** a saída é idêntica aos gabaritos oficiais (mesmos pares, tipos e distâncias). Pela fórmula do desafio, o score é 10 de 10.
- **Datasets 3 a 7:** a saída foi conferida contra uma implementação de referência por força bruta, que compara todos os pares de cada instante, sem pré-filtro, e agrupa por timestamp no arquivo inteiro. Bate em todos os casos. Para os datasets 3 a 5, essa comparação faz parte dos testes.
- **Memória:** o dataset 7 (608 MB) roda com ~67 MB de RSS e ~13 MB de heap, e funciona com o heap limitado a 128 MB (`--max-old-space-size=128`). O consumo não cresce com o tamanho do arquivo.
- **Aproveitamento:** dos 21,5 milhões de registros, só 236 fazem parte de algum encontro. Dos 1,16 bilhão de pares possíveis, só 134 passam pelo pré-filtro e têm a distância calculada.

### Qualidade dos dados de entrada

A cada `npm start`, o backend faz 10 verificações em cada linha de cada arquivo ([seção 6](#6-qualidade-da-coleta)). Nos 7 arquivos oficiais, **nenhuma falha foi encontrada** e a completude das leituras é de 100%:

- os timestamps estão em ordem, e cada instante aparece em um bloco contínuo;
- nenhuma pessoa aparece duas vezes no mesmo instante, e todas enviam posição em todos os instantes;
- as latitudes ficam entre −33,75° e 5,27°;
- as distâncias dos encontros ficam entre 7,6 m e 13,3 m. Nenhum par fica perto dos 20 m, então arredondamento não muda nenhum resultado.

---

## 2. Arquitetura

```
backend/                     A solução do desafio
├── src/
│   ├── cli/                 Comandos: processar, incluir, remover, brutos, explicar
│   ├── deteccao/            Núcleo da detecção
│   │   ├── detector.ts          Agrupamento por instante, pares, funil de aproveitamento
│   │   ├── auditoria.ts         Registro das falhas de coleta, com linha e conteúdo
│   │   ├── explicacao.ts        O que aconteceu com cada registro e cada par de um instante
│   │   ├── haversine.ts         Fórmula de Haversine e pré-filtro por caixa delimitadora
│   │   ├── classifier.ts        Regras de classificação e precedência
│   │   ├── leituraBytes.ts      Leitura de cada linha direto dos bytes (caminho rápido)
│   │   ├── streamParser.ts      parseLine e leitura com readline (referência e formatos incomuns)
│   │   └── types.ts
│   ├── arquivos/            Pastas, datasets existentes, métricas e índice de instantes
│   ├── processamento.ts     Um dataset de ponta a ponta: detecção, resposta e métricas
│   └── tests/
└── tsconfig.json

frontend/                    O BI
├── public/                  index.html e estilos.css
├── src/
│   ├── app/                 Roda no navegador
│   │   ├── abas/                Uma por aba: resumo, encontros, vitimas, faccoes, registros,
│   │   │                        brutos, qualidade, desempenho, incluir
│   │   ├── componentes/         Cartões, gráficos e tabela
│   │   ├── nucleo/              Modelo de dados, filtros, indicadores, estado e URL, API
│   │   └── main.ts
│   └── servidor/            Roda no Node: servidor, API de dados, gerador do HTML
├── tsconfig.app.json
└── tsconfig.servidor.json

shared/contrato.d.ts         Só tipos: o formato de tudo que passa entre backend e BI
exemplos/                    dataset-com-falhas.txt, com um caso de cada falha de coleta
metricas/                    Tempos, funil, falhas e validação, gravados pelo backend
```

**Como as partes conversam.** O backend e o BI não importam código um do outro:

- **Por arquivos:** o backend grava `outputs/` e `metricas/`, e o BI lê.
- **Por comandos:** para mostrar a tabela de dados brutos, incluir ou remover um dataset, o servidor do BI executa os comandos do backend (`backend/dist/cli/*.js`). Assim as regras de detecção existem num lugar só.
- **Contrato:** o formato de tudo isso está em `shared/contrato.d.ts`, e o backend é verificado contra ele na compilação.

Fluxo da detecção: `cli/processar.ts` → `processarDataset` → `EncounterDetector.processFile` → a cada mudança de timestamp, `detectInTimestamp` compara os pares do instante → pré-filtro → `haversineDistance` → `classifyEncounter`.

### Decisões

1. **Leitura em blocos, direto dos bytes.** O arquivo é lido em blocos de 16 MB, e cada linha é interpretada direto dos bytes (`deteccao/leituraBytes.ts`), sem criar uma string por linha. Só o lote do instante atual fica em memória, e os objetos das pessoas são reaproveitados entre instantes. Strings só são criadas quando o timestamp muda, quando aparece uma facção nova ou quando há falha a registrar. Linhas fora do formato comum (números com expoente, espaços, aspas no meio, maiúsculas) são decodificadas e passam pelo mesmo `parseLine` de antes, então o resultado é idêntico por construção.
2. **A versão anterior como referência.** A leitura com `readline` + `parseLine` continua no código, como `processFileReadline`. Os testes conferem que as duas dão exatamente os mesmos encontros, falhas e funil nos datasets 1 a 5, no arquivo de falhas e num arquivo de casos-limite (CRLF, BOM, sem quebra no fim, aspas, espaços, notação científica). Lado a lado no mesmo momento, a leitura em bytes é 2,2 a 3,5 vezes mais rápida, com saídas idênticas byte a byte também nos datasets 6 e 7.
3. **Agrupamento pelo timestamp em sequência.** Como os dados chegam ordenados por tempo, o lote de um instante é processado assim que o timestamp muda, sem indexar o arquivo inteiro. A auditoria avisa se um arquivo quebrar essa suposição.
4. **Pré-filtro por caixa delimitadora.** Antes do Haversine, o par é descartado se a diferença de latitude passar de 0,00025° (~27,8 m) ou a de longitude passar de 0,00035°. Na latitude máxima dos dados (33,75°), esse limite de longitude corresponde a ~32 m, então nenhum encontro real é descartado. As coordenadas de cada instante são copiadas para arrays numéricos e o teste é feito direto no laço, que roda 714 milhões de vezes no dataset 7.
5. **Auditoria sem custo para arquivos limpos.** As verificações por linha são comparações simples, e o registro de exemplos só acontece quando há falha.
6. **Sem dependências em tempo de execução.** Só módulos nativos do Node, nos dois lados.

### Onde ainda há ganho de desempenho

Hoje o tempo se divide entre interpretar as linhas (~40%) e comparar os pares de cada instante (~25%). A comparação é O(n²) por instante; com muito mais pessoas por instante, uma grade espacial (agrupar por célula de ~25 m e comparar só células vizinhas) passaria a valer a pena. Com até 120 pessoas por instante, como nos datasets do desafio, o ganho seria pequeno.

---

## 3. Regras de negócio

### 3.1 Instante e unicidade

- Só são comparadas posições com o **mesmo timestamp exato**.
- Cada par é registrado **uma vez por instante**, com os ids em ordem crescente em `monitoradosEncontro`. Se o par continua próximo no instante seguinte, isso conta como um novo encontro, porque a regra é por par e por timestamp. No BI, leituras seguidas do mesmo par aparecem agrupadas como um **episódio**.

### 3.2 Distância

Fórmula de Haversine com raio da Terra $R = 6.371.000$ m:

$$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)$$
$$d = R \cdot 2 \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1-a}\right)$$

Só entram distâncias estritamente menores que 20 m ($d < 20$).

### 3.3 Classificação (`classifier.ts`)

Aplicada nesta ordem:

1. **`protetiva`**: um dos dois tem `medidaProtetiva = true` e o outro está na sua lista `idsRestricaoMedida`, em qualquer direção.
2. **Vítima com outra pessoa:** se um dos dois é vítima e o outro **não** é o agressor restrito, ou se os dois são vítimas, o par **não é registrado**.
3. **`faccao`**: os dois têm facção preenchida e igual.
4. **`generico`**: qualquer outro par de monitorados.

A regra 2 é uma **interpretação**, porque o enunciado não trata esse caso. O motivo: o enunciado define o encontro genérico como "entre quaisquer dois monitorados", e a vítima usa um rastreador portátil, não uma tornozeleira. Na prática, a regra não afeta nenhum resultado: nos 7 datasets não existe nenhuma vítima a menos de 20 m de alguém além do seu agressor.

---

## 4. Como executar

Todos os comandos são rodados na **pasta raiz do projeto** (onde está o `package.json`).

### Passo 1: verificar o Node.js

É preciso o **Node.js 18 ou superior** (testado com o 22.2; a versão recomendada está em `.nvmrc`). Para conferir:

```bash
node -v
```

Se o comando não existir ou mostrar uma versão menor que 18, instale a versão LTS em [nodejs.org](https://nodejs.org). O `npm` vem junto.

### Passo 2: instalar as dependências

```bash
npm install
```

Instala só ferramentas de desenvolvimento (TypeScript e os tipos do Node). Precisa de internet e só é feito uma vez.

### Passo 3: conferir os arquivos de entrada

Os datasets ficam em `Inputs/`, com os nomes `dataset1.txt` a `dataset7.txt`. Os arquivos `dataset6.txt` e `dataset7.txt` (400 MB e 600 MB) passam do limite de tamanho do GitHub e **não estão no repositório**: baixe-os e coloque-os em `Inputs/`. Sem eles, o programa processa os outros cinco normalmente.

### Passo 4: rodar tudo de uma vez

```bash
npm run tudo
```

Faz, em sequência, os passos 5 a 8 abaixo: compila, processa os datasets, roda os testes e abre o BI. Leva cerca de 40 s até o BI ficar disponível. Para encerrar o servidor do BI, use `Ctrl+C`.

Se preferir rodar cada etapa separadamente:

### Passo 5: compilar

```bash
npm run build
```

Compila o backend para `backend/dist/` e o frontend para `frontend/dist/`. Rode de novo sempre que alterar o código. Para só conferir os tipos, sem gerar arquivos: `npm run typecheck`.

### Passo 6: processar os datasets

```bash
npm start
```

Processa todos os `Inputs/datasetN.txt` em sequência, em cerca de 15 s no total. Para cada um aparece uma linha como esta:

```
Processando dataset1.txt (0.2 MB)... Concluído em 0.03s (com gravação: 0.03s)! Encontros: 4 (Genéricos: 2, Facções: 1, Protetivas: 1)
```

Se um arquivo tiver problemas de coleta, aparece um `[AVISO]` logo abaixo, com a quantidade de cada tipo de falha. No fim vem uma tabela-resumo com o total de encontros e o tempo médio.

**Resultado:**

- `outputs/respostas1.json` a `respostas7.json`: os encontros detectados, no formato do desafio ([seção 7](#7-formato-de-saída)).
- `metricas/execucao.json`: tempos, memória, aproveitamento dos registros e falhas de coleta, usados pelo BI.

Para processar **um único dataset**: `npm start -- -d 3`. O `--` separa os argumentos do `npm` dos do programa.

### Passo 7: rodar os testes

```bash
npm test
```

Leva cerca de 20 s. A suíte (`backend/src/tests/detector.test.ts`) verifica:

1. A precisão do Haversine.
2. Que o pré-filtro não descarta pares reais.
3. Cada regra de classificação.
4. A saída dos datasets 1 e 2 comparada aos gabaritos oficiais (`Respostas esperadas/`).
5. A saída dos datasets 3 a 5 comparada a uma implementação de referência por força bruta.
6. A auditoria de qualidade, com `exemplos/dataset-com-falhas.txt`: cada um dos 10 tipos de falha é detectado, na linha certa e com a contagem certa.
7. Que os datasets oficiais 1 a 5 não têm nenhuma falha de coleta.
8. Que a leitura em bytes dá exatamente o mesmo resultado da versão anterior com `readline` (encontros, falhas e funil), nos datasets 1 a 5, no arquivo de falhas e num arquivo de casos-limite de formatação.

A última linha deve ser:

```
TOTAL DE TESTES: 48 | PASSARAM: 48 | FALHARAM: 0
```

Se faltar algum arquivo de entrada ou gabarito, o teste **falha**, em vez de pular a verificação. O resultado fica em `metricas/validacao.json`, que o BI usa para mostrar o score e a concordância.

### Passo 8: abrir o BI

O BI lê `outputs/` e `metricas/`, então rode antes os passos 6 e 7. Há duas formas de abrir:

**Com servidor local** (recomendado: tem todas as abas):

```bash
npm run bi:serve
```

Abra **http://localhost:4173**. Os dados são lidos dos arquivos na hora: depois de rodar `npm start` ou `npm test` de novo, clique em **Atualizar dados**, sem reiniciar o servidor. Para usar outra porta: `npm run bi:serve -- --porta 8080`.

**Como arquivo único** (para enviar ou abrir sem servidor):

```bash
npm run bi
```

Gera `frontend/dist/painel.html`, com estilos, código e dados embutidos. Basta abrir no navegador. Nesse modo, as abas **Dados brutos** e **Incluir dados** mostram só instruções, porque precisam do servidor para ler os arquivos grandes e processar arquivos novos.

### Incluir novos dados

Um novo arquivo vira o próximo dataset (o 8, depois o 9…), passa pela detecção e pela auditoria, e aparece em todas as abas do BI. Há três formas:

- **Pelo BI:** na aba **Incluir dados**, escolha o arquivo e clique em **Enviar e processar** (precisa do `npm run bi:serve`).
- **Pelo terminal:** `npm run incluir -- caminho/do/arquivo.txt`. O comando confere o cabeçalho, copia o arquivo para `Inputs/datasetN.txt` e já processa.
- **À mão:** copie o arquivo para `Inputs/` com o nome `datasetN.txt` (N maior que 7) e rode `npm start -- -d N`.

O arquivo precisa ter, na primeira linha, o mesmo cabeçalho dos datasets oficiais. Linhas com problema não impedem o processamento: elas são descartadas e aparecem na aba **Qualidade da coleta**. Para ver essa aba com falhas, inclua `exemplos/dataset-com-falhas.txt`.

Para remover um dataset incluído: botão **Remover** na aba Incluir dados, ou `npm run remover -- 8`. Os 7 oficiais não podem ser removidos. Os datasets incluídos e as respostas deles ficam fora do git.

### Referência rápida dos comandos

| Comando | O que faz |
| :--- | :--- |
| `npm run tudo` | Compila, processa, testa e abre o BI |
| `npm run build` | Compila backend e frontend (`build:backend` / `build:frontend` separados) |
| `npm run typecheck` | Confere os tipos dos 3 projetos, sem gerar arquivos |
| `npm run clean` | Apaga os arquivos compilados |
| `npm start` | Processa todos os datasets de `Inputs/` |
| `npm start -- -d N` | Processa só o dataset N |
| `npm test` | Roda os testes (exige o backend compilado; `npm run test:dev` compila antes) |
| `npm run incluir -- arquivo.txt` | Inclui e processa um novo arquivo de dados |
| `npm run remover -- N` | Remove um dataset incluído |
| `npm run brutos -- --dataset N --pagina P` | Uma página da tabela de dados brutos, em JSON (sem `--dataset`: todos) |
| `npm run explicar -- --dataset N --instante K` | Mostra, em JSON, o tratamento de cada registro e cada par de um instante |
| `npm run bi:serve` | Abre o BI em http://localhost:4173 |
| `npm run bi` | Gera o BI como arquivo único (`frontend/dist/painel.html`) |

### Problemas comuns

| Mensagem ou sintoma | Causa e solução |
| :--- | :--- |
| `Cannot find module '...backend/dist/cli/processar.js'` | O projeto não foi compilado. Rode `npm run build`. |
| `'tsc' não é reconhecido` ou `tsc: not found` | As dependências não foram instaladas. Rode `npm install`. |
| `[ERRO] Dataset inválido: 9. Disponíveis em Inputs/: ...` | Não existe `Inputs/dataset9.txt`. A mensagem lista os que existem. |
| `[AVISO] Falhas na coleta: ...` | O arquivo de entrada tem linhas com problema. Os detalhes, linha a linha, estão na aba Qualidade da coleta. |
| `TOTAL DE TESTES` com falhas | Leia as linhas `[FAIL]` acima do total. Um arquivo de entrada ou gabarito ausente também conta como falha. |
| `A porta 4173 já está em uso` | Outro programa usa a porta. Rode `npm run bi:serve -- --porta 8080`. |
| BI com o aviso "Dados incompletos" | Faltam arquivos de `outputs/` ou `metricas/`. Rode `npm start` e `npm test`, e clique em **Atualizar dados**. |
| "A primeira linha precisa ser o cabeçalho" ao incluir dados | O arquivo não tem o cabeçalho esperado. Confira o formato na aba Incluir dados. |
| Dados brutos demoram na primeira vez | O backend monta um índice de cada arquivo grande (~6 s no dataset 7). Depois fica em cache, em `metricas/indices/`, e cada página abre em menos de 1 s. |
| "Copiar CSV" não funciona no `painel.html` | Alguns navegadores bloqueiam a área de transferência em arquivos abertos do disco. Use o BI pelo servidor. |

---

## 5. O BI

O BI é organizado em abas, cada uma sobre um assunto. As abas de análise mostram poucos cartões, e cada cartão responde a uma pergunta com um número, uma frase de explicação e, quando faz sentido, a situação (Crítico, Atenção ou OK) e "Como é calculado".

| Aba | O que mostra |
| :--- | :--- |
| **Resumo** | Os 6 números principais (encontros, violações, vítimas afetadas, facções, registros úteis, falhas na coleta), a proporção de cada tipo e o caminho dos registros até o encontro. |
| **Encontros** | Total, episódios, duração, encontros muito próximos (com limite ajustável), taxa por 1.000 horas-pessoa, encontros por dataset, distância por tipo e pares que se repetem. |
| **Vítimas** | Violações de medida protetiva, vítimas afetadas, agressores reincidentes, menor distância, tempo até a primeira violação e a lista vítima a vítima. |
| **Facções** | Encontros entre membros, facções ativas, encontros por membro e ranking em número total ou proporcional ao tamanho da facção. |
| **Registros** | Todos os encontros e o cadastro de pessoas em tabela, com busca, ordenação, paginação, mapa e cópia em CSV. |
| **Dados brutos** | Uma tabela única com todas as linhas de todos os arquivos (21,5 milhões), paginada, com o tratamento de cada linha, a pessoa mais próxima no mesmo instante com a distância e o resultado de cada par que passou o pré-filtro. Opcionalmente, mostra só um dataset. |
| **Qualidade da coleta** | As 10 verificações com o número de casos e os exemplos (linha e conteúdo), e quantos registros cada dataset tem e quantos são úteis. |
| **Desempenho** | Tempo médio, vazão, memória, score no gabarito, concordância com a referência e o comparativo entre datasets. |
| **Incluir dados** | Envio de um novo arquivo, o formato esperado e a lista de datasets, com remoção dos incluídos. |

**Filtros:** a barra no topo vale para as abas de análise: dataset, período, tipo de encontro, tipo de pessoa (vítima, membro de facção, sem facção) e facção. As abas Qualidade e Desempenho usam só o filtro de dataset. Clicar num item (uma vítima, uma facção, uma coluna do gráfico) leva ao detalhe já filtrado. O recorte atual fica na URL (por exemplo, `#vitimas?ds=7&tipo=protetiva`), então dá para salvar ou compartilhar um link que abre o BI já filtrado.

---

## 6. Qualidade da coleta

O backend verifica cada linha de cada arquivo e guarda, para cada tipo de falha, o total e os primeiros 25 casos (número da linha, conteúdo e o que foi encontrado):

| Verificação | O que acontece com a leitura |
| :--- | :--- |
| Linha inválida (sem os 7 campos) | Descartada |
| Id não numérico | Descartada |
| Coordenada fora do intervalo ou ausente | Descartada |
| Timestamp fora do formato `AAAA-MM-DD HH:MM:SS` | Usada; a ordem pode ficar errada |
| Leitura fora de ordem | Usada; o agrupamento assume o arquivo ordenado |
| Instante fora de sequência (reaparece depois de outro) | Usada; encontros entre os lotes separados não são detectados |
| Leitura duplicada (mesmo id duas vezes no instante) | A repetição é ignorada |
| Leitura ausente (id sem posição em algum instante) | Não há como detectar encontro nesses instantes |
| Restrição para id que não existe no arquivo | A restrição nunca gera encontro |
| Cadastro inconsistente (vítima com facção, restrição em quem não é vítima) | Usada como está |

Para cada dataset, o BI também mostra quantos registros foram lidos, quantos são válidos, quantos tinham alguém a menos de ~25 m e quantos fazem parte de um encontro (os registros úteis).

---

## 7. Formato de saída

Um arquivo por dataset em `outputs/respostasN.json`, com um array de encontros:

```json
[
  {
    "tipo": "faccao",
    "monitoradosEncontro": [10, 11],
    "timestamp": "2024-01-01 00:02:05",
    "posicoes": {
      "10": { "lat": -14.62732, "lon": -36.31859 },
      "11": { "lat": -14.62731, "lon": -36.31869 }
    },
    "distanciaMetros": 10.81640474094182
  }
]
```
