/**
 * JIC-Lite Phase 2: Parser (语法绑定)
 *
 * Input:  Token list from Lexer
 * Output: Syntax tree with binding relationships
 *
 * Key rules:
 * - Particle tokens bind to their immediately-left noun variable
 * - Conjugation tokens bind to their immediately-left verb/adj stem
 * - Sentence-pattern macros expand into complete method chains
 * - Method chain order validation per Section 5.1
 */

import type {
  JICToken,
  JICVariableNode,
  JICOperatorNode,
  JICMethodNode,
  JICNode,
  JICSentence,
  JICWarning,
  MethodSubtype,
} from "./types";
import { METHOD_CHAIN_ORDER } from "./types";
import {
  SEMANTIC_CATEGORIES,
} from "./dictionary";

export function parse(tokens: JICToken[], original: string): JICSentence {
  const warnings: JICWarning[] = [];
  const nodes: JICNode[] = [];

  // ─── Phase 2a: Build initial node list with bindings ───────

  let currentVariable: JICVariableNode | null = null;
  let currentVerbStem: JICVariableNode | null = null;
  const operatorStack: JICOperatorNode[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.category === "variable") {
      // Create a new variable node
      const varNode: JICVariableNode = {
        type: "variable",
        token,
        operators: [],
        methods: [],
      };

      // Flush any pending operators to this variable
      for (const op of operatorStack) {
        op.boundTo = varNode;
        varNode.operators.push(op);
      }
      operatorStack.length = 0;

      nodes.push(varNode);
      currentVariable = varNode;

      // Track verb/adj stems for method binding
      if (token.subtype === "verb_stem" || token.subtype === "adj_stem") {
        currentVerbStem = varNode;
      } else {
        currentVerbStem = null;
      }

    } else if (token.category === "operator") {
      const opNode: JICOperatorNode = {
        type: "operator",
        token,
        boundTo: currentVariable,
      };

      // If we have a current variable, bind immediately
      if (currentVariable) {
        currentVariable.operators.push(opNode);
      } else {
        operatorStack.push(opNode);
      }

      nodes.push(opNode);

    } else if (token.category === "method") {
      const methodNode: JICMethodNode = {
        type: "method",
        token,
        boundTo: currentVerbStem || currentVariable,
      };

      // Bind method to the nearest verb/adj stem, or current variable
      if (currentVerbStem) {
        currentVerbStem.methods.push(methodNode);
      } else if (currentVariable) {
        currentVariable.methods.push(methodNode);
      }

      nodes.push(methodNode);
    }
  }

  // ─── Phase 2b: Operator stack validation & disambiguation ──

  for (const node of nodes) {
    if (node.type === "variable") {
      // Check for case collision (E001)
      const caseOps = node.operators.filter(o => o.token.subtype === "case_particle");
      if (caseOps.length > 1) {
        // Keep the last case particle, remove the rest
        const toRemove = caseOps.slice(0, -1);
        for (const op of toRemove) {
          const idx = node.operators.indexOf(op);
          if (idx >= 0) node.operators.splice(idx, 1);
          warnings.push({
            code: "E001",
            message: `CASE_COLLISION: Multiple case particles on "${node.token.value}". Kept [${caseOps[caseOps.length - 1].token.value}].`,
            autoFixed: true,
          });
        }
      }

      // Check operator ordering (E002): case particle must come before adverbial
      const opOrder = node.operators.map(o => o.token.subtype);
      let lastCaseIdx = -1;
      let firstAdvIdx = Infinity;
      for (let i = 0; i < opOrder.length; i++) {
        if (opOrder[i] === "case_particle") lastCaseIdx = i;
        if (opOrder[i] === "adverbial_particle" && firstAdvIdx === Infinity) firstAdvIdx = i;
      }
      if (lastCaseIdx > firstAdvIdx && firstAdvIdx !== Infinity) {
        // Auto-fix: reorder
        node.operators.sort((a, b) => {
          const aIsCase = a.token.subtype === "case_particle" ? 0 : 1;
          const bIsCase = b.token.subtype === "case_particle" ? 0 : 1;
          return aIsCase - bIsCase;
        });
        warnings.push({
          code: "E002",
          message: `OP_ORDER_CONFLICT: Reordered particles on "${node.token.value}" to case+adverbial.`,
          autoFixed: true,
        });
      }

      // Disambiguate に (Section 6.3.1)
      for (const op of node.operators) {
        if (op.token.surface === "に") {
          const resolved = disambiguateNi(node, nodes);
          if (resolved) op.token.value = resolved;
        }
        if (op.token.surface === "で") {
          const resolved = disambiguateDe(node, nodes);
          if (resolved) op.token.value = resolved;
        }
      }
    }
  }

  // ─── Phase 2c: Method chain order validation (Section 5.1) ─

  for (const node of nodes) {
    if (node.type === "variable" && node.methods.length > 1) {
      const sorted = [...node.methods].sort((a, b) => {
        const orderA = METHOD_CHAIN_ORDER[a.token.subtype as MethodSubtype] ?? 3;
        const orderB = METHOD_CHAIN_ORDER[b.token.subtype as MethodSubtype] ?? 3;
        return orderB - orderA; // Higher number = inner = first
      });

      const orderChanged = sorted.some((m, i) => m !== node.methods[i]);
      if (orderChanged) {
        node.methods = sorted;
        warnings.push({
          code: "E003",
          message: `CHAIN_ORDER_VIOLATION: Auto-reordered method chain on "${node.token.value}".`,
          autoFixed: true,
        });
      }
    }

    // Double negation check (E006)
    if (node.type === "variable") {
      const notMethods = node.methods.filter(m => m.token.value === "not");
      if (notMethods.length > 1) {
        node.methods = node.methods.filter((m, i) => {
          if (m.token.value === "not") {
            return i === node.methods.findIndex(n => n.token.value === "not");
          }
          return true;
        });
        warnings.push({
          code: "E006",
          message: `DOUBLE_NEG: Removed duplicate .not() on "${node.token.value}".`,
          autoFixed: true,
        });
      }

      // Honorific conflict (E007)
      const hasHon = node.methods.some(m => m.token.value === "hon");
      const hasHum = node.methods.some(m => m.token.value === "hum");
      if (hasHon && hasHum) {
        node.methods = node.methods.filter(m => m.token.value !== "hum");
        warnings.push({
          code: "E007",
          message: `KEIGO_CONFLICT: Removed .hum() to resolve conflict on "${node.token.value}".`,
          autoFixed: true,
        });
      }
    }

    // しか + .not() check (E004)
    if (node.type === "variable") {
      const hasOnlyNeg = node.operators.some(o => o.token.value === "ONLY-NEG");
      if (hasOnlyNeg) {
        const sentenceMethods = nodes
          .filter(n => n.type === "variable")
          .flatMap(n => (n as JICVariableNode).methods);
        const hasNot = sentenceMethods.some(m => m.token.value === "not");
        if (!hasNot) {
          warnings.push({
            code: "E004",
            message: `ONLY_NEG_MISMATCH: [ONLY-NEG] on "${node.token.value}" but no .not() in sentence.`,
            autoFixed: false,
          });
        }
      }
    }
  }

  // ─── Phase 2d: Compile to JIC-Lite code ────────────────────

  const compiled = compileToJIC(nodes);

  return {
    nodes,
    original,
    compiled,
    warnings,
  };
}

// ─── Code Generation (Phase 3) ───────────────────────────────

function compileToJIC(nodes: JICNode[]): string {
  const parts: string[] = [];

  for (const node of nodes) {
    if (node.type === "variable") {
      // Output variable name
      parts.push(node.token.value);

      // Output attached operators as [KEYWORD]
      for (const op of node.operators) {
        parts.push(`[${op.token.value}]`);
      }

      // Output attached methods as .method()
      for (const method of node.methods) {
        parts.push(`.${method.token.value}()`);
      }
    }
    // Operators and methods are rendered inline with their bound variable
  }

  return parts.join(" ") + "。";
}

// ─── Disambiguation Helpers ──────────────────────────────────

function disambiguateNi(varNode: JICVariableNode, allNodes: JICNode[]): string | null {
  const varName = varNode.token.value;

  // Step 1: Is the variable a time word?
  for (const tw of SEMANTIC_CATEGORIES.TIME_WORDS) {
    if (varName.includes(tw)) return "TIME";
  }

  // Step 1b: Is the variable a person-like recipient?
  for (const pw of SEMANTIC_CATEGORIES.PERSON_WORDS) {
    if (varName.includes(pw)) return "GIVE_TO";
  }

  // Step 2-3: Look for a nearby verb
  const verbs = allNodes
    .filter(n => n.type === "variable" && (n.token.subtype === "verb_stem"))
    .map(n => n as JICVariableNode);

  for (const verb of verbs) {
    const lemma = verb.token.value;
    if (SEMANTIC_CATEGORIES.MOTION_VERBS.has(lemma)) return "INTO";
    if (SEMANTIC_CATEGORIES.INTERACTION_VERBS.has(lemma)) return "GIVE_TO";
  }

  // Step 4: Is the variable a location?
  for (const lw of SEMANTIC_CATEGORIES.LOCATION_WORDS) {
    if (varName.includes(lw)) return "AT";
  }

  // Step 5: Default with warning
  return "INTO"; // with ambiguous marker handled at higher level
}

function disambiguateDe(varNode: JICVariableNode, allNodes: JICNode[]): string | null {
  const varName = varNode.token.value;

  // Step 1: Tool/language/transport
  for (const tw of SEMANTIC_CATEGORIES.TOOL_WORDS) {
    if (varName.includes(tw)) return "USING";
  }

  // Step 2: Location
  for (const lw of SEMANTIC_CATEGORIES.LOCATION_WORDS) {
    if (varName.includes(lw)) return "AT";
  }

  // Step 3: Scope (check verb type)
  const verbs = allNodes
    .filter(n => n.type === "variable" && n.token.subtype === "verb_stem")
    .map(n => n as JICVariableNode);
  for (const verb of verbs) {
    if (["完成する", "実現する", "達成する"].some(v => verb.token.value.includes(v))) {
      return "SCOPE";
    }
  }

  // Default
  return "AT";
}
