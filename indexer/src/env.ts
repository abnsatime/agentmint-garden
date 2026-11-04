import { isAddress, type Address } from "viem";

/** Everything the indexer needs to boot, validated once at startup. */
export interface Config {
  databaseUrl: string;
  port: number;
  logLevel: string;
  chainId: number;
  rpcUrl: string;
  logWindowBlocks: bigint;
  corsOrigins: string[];
  garden: { address: Address; deployBlock: bigint };
  market: { address: Address; deployBlock: bigint };
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`missing required environment variable ${key}`);
  return value;
}

function count(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

function bigCount(env: NodeJS.ProcessEnv, key: string): bigint {
  const raw = required(env, key);
  try {
    const parsed = BigInt(raw);
    if (parsed < 0n) throw new Error("negative");
    return parsed;
  } catch {
    throw new Error(`${key} must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
}

function address(env: NodeJS.ProcessEnv, key: string): Address {
  const raw = required(env, key);
  if (!isAddress(raw)) throw new Error(`${key} is not an address: ${raw}`);
  return raw;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    databaseUrl: required(env, "DATABASE_URL"),
    port: count(env, "PORT", 8081),
    logLevel: env.LOG_LEVEL?.trim() || "info",
    chainId: count(env, "CHAIN_ID", 97),
    rpcUrl: env.RPC_URL?.trim() || "https://bsc-testnet-rpc.publicnode.com",
    logWindowBlocks: BigInt(count(env, "LOG_WINDOW_BLOCKS", 45_000)),
    corsOrigins: (env.CORS_ORIGINS?.trim() || "https://abnsatime.github.io,http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    garden: {
      address: address(env, "GARDEN_ADDRESS"),
      deployBlock: bigCount(env, "GARDEN_DEPLOY_BLOCK"),
    },
    market: {
      address: address(env, "MARKET_ADDRESS"),
      deployBlock: bigCount(env, "MARKET_DEPLOY_BLOCK"),
    },
  };
}
