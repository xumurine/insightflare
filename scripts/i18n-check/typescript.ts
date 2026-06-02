import path from "node:path";

import ts from "typescript";

import { rlog } from "./logger";
import { APP_MESSAGES_PATH, isRelevantSourceFile, joinPath } from "./paths";
import type { TypePathMap } from "./types";

export function parseTsConfig(tsconfigPath: string): ts.ParsedCommandLine {
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

export function resolveTypeNodePath(
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

export function collectTypePaths(
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
