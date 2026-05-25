import standardFs from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import Rlog from "rlog-js";
import ts from "typescript";
import YAML from "yaml";

type JsonLike = string | number | boolean | null | JsonMap;
type JsonMap = { [key: string]: JsonLike };

interface NodeInfo {
  kind: "object" | "scalar";
  value?: string;
}

interface ResolvedPath {
  path: string[];
  dynamic: boolean;
}

interface UsageRef {
  file: string;
  line: number;
  column: number;
}

type BindingMap = Map<string, string[]>;
type TypePathMap = Map<string, string[]>;

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, "src");
const SCRIPTS_DIR = path.join(ROOT_DIR, "scripts");
const EN_PATH = path.join(SRC_DIR, "i18n", "en.yaml");
const ZH_PATH = path.join(SRC_DIR, "i18n", "zh.yaml");
const TSCONFIG_PATH = path.join(ROOT_DIR, "tsconfig.json");
const APP_MESSAGES_PATH = path.join(SRC_DIR, "lib", "i18n", "messages.ts");

const logsDir = path.join(ROOT_DIR, "logs");
if (!standardFs.existsSync(logsDir)) {
  standardFs.mkdirSync(logsDir, { recursive: true });
}

const rlog = new Rlog({
  logFilePath: path.join(logsDir, "i18n.log"),
  enableColorfulOutput: true,
});

function asPosix(input: string): string {
  return input.replace(/\\/g, "/");
}

function relativeFromRoot(input: string): string {
  return asPosix(path.relative(ROOT_DIR, input));
}

function joinPath(parts: string[]): string {
  return parts.join(".");
}

function normalizeValue(value: JsonLike): JsonMap {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  throw new Error("Expected top-level YAML object");
}

async function readYaml(filePath: string): Promise<JsonMap> {
  const text = await fs.readFile(filePath, "utf8");
  return normalizeValue(YAML.parse(text) as JsonLike);
}

function collectNodes(
  value: JsonLike,
  prefix: string[],
  nodes: Map<string, NodeInfo>,
  leaves: Map<string, string>,
): void {
  const currentPath = joinPath(prefix);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (currentPath) {
      nodes.set(currentPath, { kind: "object" });
    }
    for (const [key, child] of Object.entries(value)) {
      collectNodes(child, [...prefix, key], nodes, leaves);
    }
    return;
  }

  const scalar = value === null || value === undefined ? "" : String(value);
  nodes.set(currentPath, { kind: "scalar", value: scalar });
  leaves.set(currentPath, scalar);
}

function extractPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
    .map((match) => match[1] ?? "")
    .filter((part) => part.length > 0)
    .sort();
}

function sameArray(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function toPos(
  filePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
): UsageRef {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return {
    file: relativeFromRoot(filePath),
    line: line + 1,
    column: character + 1,
  };
}

function isRelevantSourceFile(filePath: string): boolean {
  const normalized = asPosix(filePath);
  if (normalized.includes("/node_modules/")) return false;
  if (normalized.includes("/.next/")) return false;
  if (normalized.includes("/.open-next/")) return false;
  return (
    normalized.startsWith(asPosix(SRC_DIR)) ||
    normalized.startsWith(asPosix(SCRIPTS_DIR))
  );
}

function parseTsConfig(tsconfigPath: string): ts.ParsedCommandLine {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
    );
  }

  return ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath),
  );
}

function getAppMessagesType(
  program: ts.Program,
  checker: ts.TypeChecker,
): { type: ts.Type; symbol: ts.Symbol } {
  const sourceFile = program
    .getSourceFiles()
    .find((file) => path.resolve(file.fileName) === APP_MESSAGES_PATH);
  if (!sourceFile) {
    throw new Error(
      `Unable to find ${relativeFromRoot(APP_MESSAGES_PATH)} in ts.Program`,
    );
  }

  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) &&
      statement.name.text === "AppMessages",
  );
  if (!declaration) {
    throw new Error("Unable to locate AppMessages interface declaration");
  }

  const type = checker.getTypeAtLocation(declaration.name);
  const symbol = type.getSymbol();
  if (!symbol) {
    throw new Error("Unable to resolve AppMessages symbol");
  }

  return { type, symbol };
}

function resolveTypeNodePath(
  typeNode: ts.TypeNode | undefined,
  typePaths: TypePathMap,
  filePath: string,
  checker: ts.TypeChecker,
): string[] | null {
  if (!typeNode) return null;

  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText();
    const symbol = checker.getSymbolAtLocation(typeNode.typeName);
    if (symbol) {
      let resolvedSymbol = symbol;
      if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
        try {
          resolvedSymbol = checker.getAliasedSymbol(symbol);
        } catch {
          // ignore
        }
      }
      const decl = resolvedSymbol.declarations?.[0];
      if (decl) {
        const declFilePath = path.resolve(decl.getSourceFile().fileName);
        const declName = resolvedSymbol.name;
        const declKey = `${declFilePath}::${declName}`;
        if (typePaths.has(declKey)) {
          return [...(typePaths.get(declKey) ?? [])];
        }
      }
    }

    const localKey = `${filePath}::${typeName}`;
    if (typePaths.has(localKey)) {
      return [...(typePaths.get(localKey) ?? [])];
    }
    if (typePaths.has(typeName)) {
      return [...(typePaths.get(typeName) ?? [])];
    }
    if (typeName === "AppMessages") {
      return [];
    }
    return null;
  }

  if (ts.isIndexedAccessTypeNode(typeNode)) {
    const objectPath = resolveTypeNodePath(
      typeNode.objectType,
      typePaths,
      filePath,
      checker,
    );
    if (!objectPath) return null;
    if (!ts.isLiteralTypeNode(typeNode.indexType)) return null;
    if (!ts.isStringLiteral(typeNode.indexType.literal)) return null;
    return [...objectPath, typeNode.indexType.literal.text];
  }

  if (ts.isParenthesizedTypeNode(typeNode)) {
    return resolveTypeNodePath(typeNode.type, typePaths, filePath, checker);
  }

  return null;
}

function collectTypePaths(
  program: ts.Program,
  checker: ts.TypeChecker,
): TypePathMap {
  const typePaths: TypePathMap = new Map([["AppMessages", []]]);

  let changed = true;
  let iterations = 0;
  while (changed) {
    if (iterations++ > 50) {
      rlog.warn(
        "Warning: Exceeded 50 iterations in collectTypePaths. Breaking to prevent infinite loop.",
      );
      break;
    }
    changed = false;

    for (const sourceFile of program.getSourceFiles()) {
      const filePath = path.resolve(sourceFile.fileName);
      if (!isRelevantSourceFile(filePath) && filePath !== APP_MESSAGES_PATH)
        continue;

      for (const statement of sourceFile.statements) {
        if (!ts.isTypeAliasDeclaration(statement)) continue;
        const nextPath = resolveTypeNodePath(
          statement.type,
          typePaths,
          filePath,
          checker,
        );
        if (!nextPath) continue;
        const key = `${filePath}::${statement.name.text}`;
        const current = typePaths.get(key);
        if (!current || joinPath(current) !== joinPath(nextPath)) {
          typePaths.set(key, nextPath);
          changed = true;
        }
      }
    }
  }

  return typePaths;
}

function isRootAppMessagesType(
  type: ts.Type,
  checker: ts.TypeChecker,
  appMessagesType: ts.Type,
  appMessagesSymbol: ts.Symbol,
): boolean {
  if ((type.flags & ts.TypeFlags.Any) !== 0) return false;

  if (
    type.aliasSymbol &&
    (type.aliasSymbol.flags & ts.SymbolFlags.Alias) !== 0
  ) {
    const aliased = checker.getAliasedSymbol(type.aliasSymbol);
    if (aliased === appMessagesSymbol) return true;
  }

  const symbol = type.getSymbol();
  if (symbol === appMessagesSymbol) return true;

  if (
    "isTypeAssignableTo" in checker &&
    typeof checker.isTypeAssignableTo === "function"
  ) {
    try {
      return checker.isTypeAssignableTo(type, appMessagesType);
    } catch {
      return false;
    }
  }

  return checker.typeToString(type) === "AppMessages";
}

function resolvePathFromExpression(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  bindings: BindingMap[],
  appMessagesType: ts.Type,
  appMessagesSymbol: ts.Symbol,
): ResolvedPath | null {
  if (ts.isParenthesizedExpression(expression)) {
    return resolvePathFromExpression(
      expression.expression,
      checker,
      bindings,
      appMessagesType,
      appMessagesSymbol,
    );
  }

  if (ts.isIdentifier(expression)) {
    for (let index = bindings.length - 1; index >= 0; index -= 1) {
      const bound = bindings[index]?.get(expression.text);
      if (bound) {
        return { path: [...bound], dynamic: false };
      }
    }

    const type = checker.getTypeAtLocation(expression);
    if (
      isRootAppMessagesType(type, checker, appMessagesType, appMessagesSymbol)
    ) {
      return { path: [], dynamic: false };
    }
    return null;
  }

  if (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "getMessages"
  ) {
    return { path: [], dynamic: false };
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const base = resolvePathFromExpression(
      expression.expression,
      checker,
      bindings,
      appMessagesType,
      appMessagesSymbol,
    );
    if (!base) return null;
    return {
      path: [...base.path, expression.name.text],
      dynamic: base.dynamic,
    };
  }

  if (ts.isElementAccessExpression(expression)) {
    const base = resolvePathFromExpression(
      expression.expression,
      checker,
      bindings,
      appMessagesType,
      appMessagesSymbol,
    );
    if (!base) return null;

    const argument = expression.argumentExpression;
    if (
      argument &&
      (ts.isStringLiteral(argument) ||
        ts.isNoSubstitutionTemplateLiteral(argument))
    ) {
      return {
        path: [...base.path, argument.text],
        dynamic: base.dynamic,
      };
    }

    return { path: [...base.path], dynamic: true };
  }

  return null;
}

function bindName(
  name: ts.BindingName,
  prefix: string[],
  scope: BindingMap,
): void {
  if (ts.isIdentifier(name)) {
    scope.set(name.text, [...prefix]);
    return;
  }

  if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      const propertyName = element.propertyName;
      if (
        propertyName &&
        !ts.isIdentifier(propertyName) &&
        !ts.isStringLiteral(propertyName)
      )
        continue;
      const key = propertyName
        ? ts.isIdentifier(propertyName)
          ? propertyName.text
          : propertyName.text
        : ts.isIdentifier(element.name)
          ? element.name.text
          : null;
      if (!key) continue;
      bindName(element.name, [...prefix, key], scope);
    }
  }
}

function addUsage(
  map: Map<string, UsageRef[]>,
  key: string,
  ref: UsageRef,
): void {
  const existing = map.get(key) ?? [];
  existing.push(ref);
  map.set(key, existing);
}

function isOutermostAccess(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): boolean {
  const parent = node.parent;
  return !(
    (ts.isPropertyAccessExpression(parent) ||
      ts.isElementAccessExpression(parent)) &&
    parent.expression === node
  );
}

function isAliasInitializer(node: ts.Node): boolean {
  return (
    ts.isVariableDeclaration(node.parent) && node.parent.initializer === node
  );
}

function collectUsedKeys(
  program: ts.Program,
  checker: ts.TypeChecker,
  appMessagesType: ts.Type,
  appMessagesSymbol: ts.Symbol,
  definedNodes: Map<string, NodeInfo>,
  typePaths: TypePathMap,
): Map<string, UsageRef[]> {
  const used = new Map<string, UsageRef[]>();

  const relevantFiles = program
    .getSourceFiles()
    .filter((file) => isRelevantSourceFile(path.resolve(file.fileName)));
  const total = relevantFiles.length;
  let count = 0;

  for (const sourceFile of relevantFiles) {
    const filePath = path.resolve(sourceFile.fileName);
    count += 1;
    rlog.progress(count, total);

    const bindings: BindingMap[] = [new Map<string, string[]>()];

    const visit = (node: ts.Node): void => {
      let pushedScope = false;
      if (ts.isFunctionLike(node) || ts.isSourceFile(node)) {
        if (!ts.isSourceFile(node)) {
          bindings.push(new Map<string, string[]>());
          pushedScope = true;
          for (const parameter of node.parameters) {
            const fromType = resolveTypeNodePath(
              parameter.type,
              typePaths,
              filePath,
              checker,
            );
            if (fromType) {
              bindName(
                parameter.name,
                fromType,
                bindings[bindings.length - 1]!,
              );
            } else if (
              ts.isObjectBindingPattern(parameter.name) &&
              parameter.type
            ) {
              const paramType = checker.getTypeAtLocation(parameter.type);
              for (const element of parameter.name.elements) {
                if (ts.isIdentifier(element.name)) {
                  let elementTypeNode: ts.TypeNode | undefined = undefined;
                  const propSymbol = paramType.getProperty(element.name.text);
                  if (
                    propSymbol &&
                    propSymbol.declarations &&
                    propSymbol.declarations.length > 0
                  ) {
                    const decl = propSymbol.declarations[0];
                    if (ts.isPropertySignature(decl)) {
                      elementTypeNode = decl.type;
                    } else if (ts.isPropertyDeclaration(decl)) {
                      elementTypeNode = decl.type;
                    }
                  }

                  let path: string[] | null = null;
                  if (elementTypeNode) {
                    path = resolveTypeNodePath(
                      elementTypeNode,
                      typePaths,
                      filePath,
                      checker,
                    );
                  }

                  if (!path) {
                    const type = checker.getTypeAtLocation(element.name);
                    let typeName: string | null = null;
                    if (type.aliasSymbol) {
                      typeName = type.aliasSymbol.name;
                    } else {
                      const symbol = type.getSymbol();
                      if (symbol) {
                        typeName = symbol.name;
                      } else {
                        typeName = checker.typeToString(type);
                      }
                    }

                    if (typeName) {
                      const localKey = `${filePath}::${typeName}`;
                      if (typePaths.has(localKey)) {
                        path = typePaths.get(localKey) ?? null;
                      } else if (typePaths.has(typeName)) {
                        path = typePaths.get(typeName) ?? null;
                      } else if (typeName === "AppMessages") {
                        path = [];
                      }
                    }
                  }

                  if (path) {
                    bindName(
                      element.name,
                      path,
                      bindings[bindings.length - 1]!,
                    );
                  }
                }
              }
            }
            if (!parameter.initializer) continue;
            const resolved = resolvePathFromExpression(
              parameter.initializer,
              checker,
              bindings,
              appMessagesType,
              appMessagesSymbol,
            );
            if (resolved) {
              bindName(
                parameter.name,
                resolved.path,
                bindings[bindings.length - 1]!,
              );
            }
          }
        }
      }

      if (ts.isVariableDeclaration(node) && node.initializer) {
        const fromType = resolveTypeNodePath(
          node.type,
          typePaths,
          filePath,
          checker,
        );
        if (fromType) {
          bindName(node.name, fromType, bindings[bindings.length - 1]!);
        }

        const resolved = resolvePathFromExpression(
          node.initializer,
          checker,
          bindings,
          appMessagesType,
          appMessagesSymbol,
        );
        if (resolved) {
          bindName(node.name, resolved.path, bindings[bindings.length - 1]!);
        }
      }

      if (
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        isOutermostAccess(node)
      ) {
        const resolved = resolvePathFromExpression(
          node,
          checker,
          bindings,
          appMessagesType,
          appMessagesSymbol,
        );
        if (resolved && resolved.path.length > 0) {
          const resolvedKey = joinPath(resolved.path);
          const nodeInfo = definedNodes.get(resolvedKey);
          if (
            isAliasInitializer(node) &&
            nodeInfo?.kind === "object" &&
            !resolved.dynamic
          ) {
            ts.forEachChild(node, visit);
            if (pushedScope) {
              bindings.pop();
            }
            return;
          }

          addUsage(used, resolvedKey, toPos(filePath, sourceFile, node));
        }
      }

      ts.forEachChild(node, visit);

      if (pushedScope) {
        bindings.pop();
      }
    };

    visit(sourceFile);
  }

  return used;
}

function startsWithPath(pathValue: string, prefix: string): boolean {
  return pathValue === prefix || pathValue.startsWith(`${prefix}.`);
}

function findUsedButMissing(
  usedPaths: string[],
  definedNodes: Map<string, NodeInfo>,
): string[] {
  return usedPaths.filter((usedPath) => {
    if (definedNodes.has(usedPath)) return false;
    for (const definedPath of definedNodes.keys()) {
      if (startsWithPath(definedPath, usedPath)) return false;
    }
    return true;
  });
}

function findUnusedLeaves(
  leaves: Map<string, string>,
  usedPaths: string[],
): string[] {
  return [...leaves.keys()].filter(
    (leafPath) =>
      !usedPaths.some((usedPath) => startsWithPath(leafPath, usedPath)),
  );
}

function compareNodeShapes(
  left: Map<string, NodeInfo>,
  right: Map<string, NodeInfo>,
): {
  missingOnRight: string[];
  missingOnLeft: string[];
  kindMismatch: string[];
} {
  const missingOnRight: string[] = [];
  const missingOnLeft: string[] = [];
  const kindMismatch: string[] = [];

  for (const [key, value] of left) {
    const other = right.get(key);
    if (!other) {
      missingOnRight.push(key);
      continue;
    }
    if (other.kind !== value.kind) {
      kindMismatch.push(key);
    }
  }

  for (const key of right.keys()) {
    if (!left.has(key)) {
      missingOnLeft.push(key);
    }
  }

  return {
    missingOnRight: missingOnRight.sort(),
    missingOnLeft: missingOnLeft.sort(),
    kindMismatch: kindMismatch.sort(),
  };
}

function comparePlaceholders(
  enLeaves: Map<string, string>,
  zhLeaves: Map<string, string>,
): Array<{ key: string; en: string[]; zh: string[] }> {
  const mismatches: Array<{ key: string; en: string[]; zh: string[] }> = [];

  for (const [key, enValue] of enLeaves) {
    const zhValue = zhLeaves.get(key);
    if (zhValue === undefined) continue;
    const enPlaceholders = extractPlaceholders(enValue);
    const zhPlaceholders = extractPlaceholders(zhValue);
    if (!sameArray(enPlaceholders, zhPlaceholders)) {
      mismatches.push({
        key,
        en: enPlaceholders,
        zh: zhPlaceholders,
      });
    }
  }

  return mismatches.sort((left, right) => left.key.localeCompare(right.key));
}

function formatUsageRefs(refs: UsageRef[] | undefined): string {
  if (!refs || refs.length === 0) return "";
  return refs
    .slice(0, 3)
    .map((ref) => `${ref.file}:${ref.line}:${ref.column}`)
    .join(", ");
}

async function main(): Promise<void> {
  rlog.info("Loading translation files (en.yaml, zh.yaml)...");
  const [enYaml, zhYaml] = await Promise.all([
    readYaml(EN_PATH),
    readYaml(ZH_PATH),
  ]);

  rlog.info("Parsing translation keys and building tree maps...");
  const enNodes = new Map<string, NodeInfo>();
  const zhNodes = new Map<string, NodeInfo>();
  const enLeaves = new Map<string, string>();
  const zhLeaves = new Map<string, string>();
  collectNodes(enYaml, [], enNodes, enLeaves);
  collectNodes(zhYaml, [], zhNodes, zhLeaves);

  rlog.info("Parsing tsconfig.json...");
  const config = parseTsConfig(TSCONFIG_PATH);

  rlog.info(
    `Creating TypeScript program for ${config.fileNames.length} files...`,
  );
  const program = ts.createProgram({
    rootNames: config.fileNames,
    options: config.options,
  });

  rlog.info("Acquiring TypeScript TypeChecker...");
  const checker = program.getTypeChecker();

  rlog.info("Resolving referenced translation type paths...");
  const typePaths = collectTypePaths(program, checker);

  rlog.info("Analyzing AppMessages type properties...");
  const { type: appMessagesType, symbol: appMessagesSymbol } =
    getAppMessagesType(program, checker);

  rlog.info("Scanning codebase to collect all referenced keys...");
  const usageMap = collectUsedKeys(
    program,
    checker,
    appMessagesType,
    appMessagesSymbol,
    enNodes,
    typePaths,
  );
  const usedPaths = [...usageMap.keys()].sort();

  rlog.info("Running diagnostics validation...");

  const shapeDiff = compareNodeShapes(enNodes, zhNodes);
  const placeholderMismatches = comparePlaceholders(enLeaves, zhLeaves);
  const usedButMissingInEn = findUsedButMissing(usedPaths, enNodes);
  const usedButMissingInZh = findUsedButMissing(usedPaths, zhNodes);
  const unusedEnKeys = findUnusedLeaves(enLeaves, usedPaths);
  const unusedZhKeys = findUnusedLeaves(zhLeaves, usedPaths);

  const errors =
    shapeDiff.missingOnRight.length +
    shapeDiff.missingOnLeft.length +
    shapeDiff.kindMismatch.length +
    placeholderMismatches.length +
    usedButMissingInEn.length +
    usedButMissingInZh.length;

  if (errors > 0) {
    rlog.error("I18n Check Failed!");
  } else {
    rlog.success("I18n Check Passed Successfully!");
  }

  rlog.log(`- en leaf keys: ${enLeaves.size}`);
  rlog.log(`- zh leaf keys: ${zhLeaves.size}`);
  rlog.log(`- referenced key paths: ${usedPaths.length}`);
  if (errors > 0) {
    rlog.error(`- structural errors: ${errors}`);
  } else {
    rlog.success(`- structural errors: ${errors}`);
  }

  if (unusedEnKeys.length > 0) {
    rlog.warn(`- unused en leaf keys: ${unusedEnKeys.length}`);
  } else {
    rlog.log(`- unused en leaf keys: ${unusedEnKeys.length}`);
  }

  if (unusedZhKeys.length > 0) {
    rlog.warn(`- unused zh leaf keys: ${unusedZhKeys.length}`);
  } else {
    rlog.log(`- unused zh leaf keys: ${unusedZhKeys.length}`);
  }

  if (shapeDiff.missingOnRight.length > 0) {
    rlog.error("\nMissing In zh.yaml");
    for (const key of shapeDiff.missingOnRight) {
      rlog.warn(`- ${key}`);
    }
  }

  if (shapeDiff.missingOnLeft.length > 0) {
    rlog.error("\nMissing In en.yaml");
    for (const key of shapeDiff.missingOnLeft) {
      rlog.warn(`- ${key}`);
    }
  }

  if (shapeDiff.kindMismatch.length > 0) {
    rlog.error("\nType Mismatches");
    for (const key of shapeDiff.kindMismatch) {
      rlog.warn(`- ${key}`);
    }
  }

  if (placeholderMismatches.length > 0) {
    rlog.error("\nPlaceholder Mismatches");
    for (const mismatch of placeholderMismatches) {
      rlog.warn(`- ${mismatch.key}`);
      rlog.log(`  en: ${mismatch.en.join(", ") || "(none)"}`);
      rlog.log(`  zh: ${mismatch.zh.join(", ") || "(none)"}`);
    }
  }

  if (usedButMissingInEn.length > 0) {
    rlog.error("\nUsed But Missing In en.yaml");
    for (const key of usedButMissingInEn) {
      rlog.warn(`- ${key} (${formatUsageRefs(usageMap.get(key))})`);
    }
  }

  if (usedButMissingInZh.length > 0) {
    rlog.error("\nUsed But Missing In zh.yaml");
    for (const key of usedButMissingInZh) {
      rlog.warn(`- ${key} (${formatUsageRefs(usageMap.get(key))})`);
    }
  }

  if (unusedEnKeys.length > 0) {
    rlog.file.info("\nUnused en.yaml Keys");
    rlog.screen.info("Writing unused en.yaml keys to local log file...");
    let i = 0;
    for (const key of unusedEnKeys) {
      rlog.file.info(`- ${key}`);
      i += 1;
      rlog.progress(i, unusedEnKeys.length);
    }
  }

  if (unusedZhKeys.length > 0) {
    rlog.file.info("\nUnused zh.yaml Keys");
    rlog.screen.info("Writing unused zh.yaml keys to local log file...");
    let i = 0;
    for (const key of unusedZhKeys) {
      rlog.file.info(`- ${key}`);
      i += 1;
      rlog.progress(i, unusedZhKeys.length);
    }
  }

  const args = process.argv.slice(2);
  const isPruneMode = args.includes("--prune");

  if (isPruneMode && (unusedEnKeys.length > 0 || unusedZhKeys.length > 0)) {
    rlog.info("\nPruning unused keys from translation files...");

    const enText = await fs.readFile(EN_PATH, "utf8");
    const zhText = await fs.readFile(ZH_PATH, "utf8");

    const enDoc = YAML.parseDocument(enText);
    const zhDoc = YAML.parseDocument(zhText);

    let enPruned = 0;
    for (const key of unusedEnKeys) {
      enDoc.deleteIn(key.split("."));
      enPruned += 1;
    }

    let zhPruned = 0;
    for (const key of unusedZhKeys) {
      zhDoc.deleteIn(key.split("."));
      zhPruned += 1;
    }

    const prunedEnText = enDoc.toString();
    const prunedZhText = zhDoc.toString();

    await Promise.all([
      fs.writeFile(EN_PATH, prunedEnText, "utf8"),
      fs.writeFile(ZH_PATH, prunedZhText, "utf8"),
    ]);

    rlog.success(
      `Successfully pruned ${enPruned} keys from en.yaml and ${zhPruned} keys from zh.yaml!`,
    );

    rlog.info(
      "Regenerating messages.ts schema to match pruned translations...",
    );
    const parsedEnYaml = YAML.parse(prunedEnText);

    const toTsInterface = (
      obj: JsonLike,
      indent: number = 2,
      path: string[] = [],
    ): string => {
      const currentPath = path.join(".");
      if (
        currentPath === "common.continentLabels" ||
        currentPath === "geo.investigation.typeLabels"
      ) {
        return "Record<string, string>";
      }

      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        const spaces = " ".repeat(indent);
        const childSpaces = " ".repeat(indent + 2);
        const lines = ["{"];
        for (const [key, value] of Object.entries(obj)) {
          const propType = toTsInterface(value, indent + 2, [...path, key]);
          lines.push(`${childSpaces}${key}: ${propType};`);
        }
        lines.push(`${spaces}}`);
        return lines.join("\n");
      }

      return "string";
    };

    const interfaceBody = [];
    for (const [key, value] of Object.entries(
      parsedEnYaml as Record<string, unknown>,
    )) {
      const propType = toTsInterface(value as JsonLike, 2, [key]);
      interfaceBody.push(`  ${key}: ${propType};`);
    }

    const messagesOutput = `import en from "@/i18n/en.yaml";
import zh from "@/i18n/zh.yaml";

import type { Locale } from "./config";

export interface AppMessages {
${interfaceBody.join("\n")}
}

const DICTIONARIES: Record<Locale, AppMessages> = {
  en: en as AppMessages,
  zh: zh as AppMessages,
};

export function getMessages(locale: Locale): AppMessages {
  return DICTIONARIES[locale];
}
`;

    await fs.writeFile(APP_MESSAGES_PATH, messagesOutput, "utf8");
    rlog.success("Successfully regenerated messages.ts schema!");
  }

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  rlog.error(message);
  process.exitCode = 1;
});
