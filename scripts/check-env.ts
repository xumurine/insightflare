// scripts/check-env.ts
// 检查环境变量设置是否正确，确保生产环境安全

import { randomBytes } from "node:crypto";

import Rlog from "rlog-js";

const rlog = new Rlog();

// 计算香农熵
function calculateShannonEntropy(str: string): number {
  const len = str.length;
  const frequencies = new Map<string, number>();
  for (const char of str) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// 生成强随机密钥
function generateStrongSecret(): string {
  return randomBytes(32).toString("hex");
}

// 必需的环境变量配置
const REQUIRED_ENV_VARS = [
  {
    name: "MAIN_SECRET",
    description:
      "Root secret for deriving session keys, API key hashes, and visitor salts",
    validator: (value: string) => {
      if (value.length < 32) {
        return "Should be at least 32 characters long for security";
      }
      const entropy = calculateShannonEntropy(value);
      if (entropy < 3.5) {
        return `Entropy is too low (${entropy.toFixed(2)}). Please use a more random secret (aim for > 3.5).`;
      }
      return null;
    },
  },
];

// 可选但推荐的环境变量
const RECOMMENDED_ENV_VARS = [
  {
    name: "BOOTSTRAP_ADMIN_PASSWORD",
    description: "Password for the default admin account",
    validator: (value: string) => {
      if (value.length < 12) {
        return "Should be at least 12 characters long";
      }
      return null;
    },
  },
  {
    name: "DASHBOARD_SESSION_SECRET",
    description: "Optional override for dashboard session signing key",
    validator: (value: string) => {
      if (value.length < 16) {
        return "Should be at least 16 characters long";
      }
      return null;
    },
  },
];

// 检查是否为生产环境
function isProduction(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.CF_PAGES === "1" ||
    process.env.VERCEL === "1" ||
    process.env.CI === "true"
  );
}

// 检查是否为 Demo 模式
function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "1";
}

// 导出的环境检查函数
export async function checkEnvironmentVariables(options?: {
  strict?: boolean;
}): Promise<void> {
  const strict = options?.strict ?? isProduction();
  let hasErrors = false;
  let hasWarnings = false;

  // Demo 模式跳过检查
  if (isDemoMode()) {
    rlog.info("> Demo mode detected, skipping environment checks");
    return;
  }

  rlog.info("> Checking environment variables...");

  // 检查必需的环境变量
  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.name];

    if (!value) {
      if (strict) {
        rlog.error(`  ✗ ${envVar.name} is MISSING (required in production)`);
        rlog.error(`    ${envVar.description}`);
        const generated = generateStrongSecret();
        rlog.info(`    Suggested value: ${generated}`);
        hasErrors = true;
      } else {
        rlog.warn(`  ⚠ ${envVar.name} is not set (using insecure default)`);
        rlog.warn(`    ${envVar.description}`);
        hasWarnings = true;
      }
    } else {
      const validationError = envVar.validator(value);
      if (validationError) {
        rlog.error(`  ✗ ${envVar.name} is invalid: ${validationError}`);
        const generated = generateStrongSecret();
        rlog.info(`    Suggested value: ${generated}`);
        hasErrors = true;
      } else {
        rlog.success(`  ✓ ${envVar.name} is set and valid`);
      }
    }
  }

  // 检查推荐的环境变量
  for (const envVar of RECOMMENDED_ENV_VARS) {
    const value = process.env[envVar.name];

    if (!value) {
      rlog.warn(`  ⚠ ${envVar.name} is not set (recommended)`);
      rlog.warn(`    ${envVar.description}`);
      hasWarnings = true;
    } else {
      const validationError = envVar.validator(value);
      if (validationError) {
        rlog.warn(`  ⚠ ${envVar.name}: ${validationError}`);
        hasWarnings = true;
      } else {
        rlog.success(`  ✓ ${envVar.name} is set and valid`);
      }
    }
  }

  // 总结检查结果
  if (hasErrors) {
    rlog.error("");
    rlog.error("✗ Environment variables check FAILED!");
    rlog.error("  Production deployments require MAIN_SECRET to be set.");
    rlog.error("  This prevents session forgery and API key compromise.");
    rlog.error("");
    rlog.error("  Set MAIN_SECRET in your environment:");
    rlog.error("    - Cloudflare: wrangler secret put MAIN_SECRET");
    rlog.error("    - Local .env: MAIN_SECRET=<your-secure-secret>");
    rlog.error("");
    throw new Error(
      "Required environment variables are missing or invalid. " +
        "MAIN_SECRET must be set for production deployments.",
    );
  }

  if (hasWarnings) {
    rlog.warn("");
    rlog.warn("  Environment variables check completed with warnings.");
    rlog.warn("  Consider setting recommended variables for better security.");
  } else {
    rlog.success("✓ Environment variables check passed");
  }
}
