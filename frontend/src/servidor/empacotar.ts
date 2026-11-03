/**
 * Empacotador mínimo para os módulos do app (frontend/dist/app/**.js), sem dependências.
 *
 * Junta os módulos em ordem de dependência dentro de uma única função, removendo os
 * `import { ... } from './x.js'` e o prefixo `export`. Funciona porque o app segue
 * três regras, verificadas aqui:
 *   1. só imports nomeados e relativos (`./x.js`, `../pasta/x.js`), sem `as`;
 *   2. nada de `export default`, `export { }` ou `export *`;
 *   3. nomes de topo únicos entre todos os módulos (todos ficam no mesmo escopo).
 * Assim o HTML gerado funciona aberto direto do disco (file://), onde módulos ES não carregam.
 */
import fs from 'fs';
import path from 'path';

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[\w./-]+\.js)['"];?[ \t]*$/gm;
const EXPORT_RE = /^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm;
const DECL_RE = /^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

interface Modulo { chave: string; deps: string[]; corpo: string }

function lerModulo(raiz: string, chave: string): Modulo {
  const arquivo = path.join(raiz, ...chave.split('/'));
  if (!fs.existsSync(arquivo)) throw new Error(`Módulo não encontrado: ${chave}. Rode "npm run build:frontend".`);
  const fonte = fs.readFileSync(arquivo, 'utf8');
  const proibido = fonte.match(/^export\s+(default|\{|\*)|^import\s+(?!\{)|^import\s*\{[^}]*\bas\b/m);
  if (proibido) {
    throw new Error(`${chave}: construção não suportada pelo empacotador: "${proibido[0].trim()}". Use imports e exports nomeados, sem "as".`);
  }
  const deps: string[] = [];
  const corpo = fonte
    .replace(IMPORT_RE, (_m, _nomes, alvo: string) => {
      deps.push(path.posix.normalize(path.posix.join(path.posix.dirname(chave), alvo)));
      return '';
    })
    .replace(/^export\s*\{\s*\};?\s*$/gm, '') // módulo só de tipos
    .replace(EXPORT_RE, '')
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '');
  return { chave, deps, corpo };
}

/** Retorna o código empacotado a partir do módulo de entrada (caminho relativo a `raiz`). */
export function empacotarFront(raiz: string, entrada = 'main.js'): string {
  const mods = new Map<string, Modulo>();
  const ordem: string[] = [];
  const visitando = new Set<string>();

  const visitar = (chave: string): void => {
    if (mods.has(chave) || visitando.has(chave)) return; // ciclos são tolerados: o topo dos módulos só declara
    visitando.add(chave);
    const m = lerModulo(raiz, chave);
    m.deps.forEach(visitar);
    mods.set(chave, m);
    ordem.push(chave);
    visitando.delete(chave);
  };
  visitar(entrada);

  // Regra 3: nomes de topo únicos
  const dono = new Map<string, string>();
  for (const chave of ordem) {
    for (const [, id] of mods.get(chave)!.corpo.matchAll(DECL_RE)) {
      const outro = dono.get(id);
      if (outro) throw new Error(`Nome "${id}" declarado em ${outro} e em ${chave}; renomeie um deles.`);
      dono.set(id, chave);
    }
  }

  const partes = ordem.map(chave => `// ---- ${chave}\n${mods.get(chave)!.corpo.trim()}\n`);
  return `(() => {\n'use strict';\n${partes.join('\n')}})();\n`;
}
