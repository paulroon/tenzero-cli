import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseJsonFile } from "@/lib/json";
import { getUserSecretsPath } from "@/lib/paths";

export type SecretMap = Record<string, string>;

function loadStoredSecrets(): SecretMap {
  const parsed = parseJsonFile<Record<string, unknown>>(getUserSecretsPath());
  if (!parsed || typeof parsed !== "object") return {};
  const secrets: SecretMap = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") continue;
    const normalized = normalizeSecretKey(key);
    if (normalized) secrets[normalized] = value;
  }
  return secrets;
}

function saveStoredSecrets(secrets: SecretMap): void {
  mkdirSync(dirname(getUserSecretsPath()), { recursive: true });
  writeFileSync(getUserSecretsPath(), JSON.stringify(secrets, null, 2), "utf-8");
}

export function normalizeSecretKey(input: string): string | null {
  const key = input.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) return null;
  return key;
}

export function listStoredSecretKeys(): string[] {
  return Object.keys(loadStoredSecrets()).sort((a, b) => a.localeCompare(b));
}

export function setStoredSecret(key: string, value: string): void {
  const normalized = normalizeSecretKey(key);
  if (!normalized) {
    throw new Error("Invalid secret key. Use A-Z, 0-9 and underscore only.");
  }
  const secrets = loadStoredSecrets();
  secrets[normalized] = value;
  saveStoredSecrets(secrets);
}

export function deleteStoredSecret(key: string): void {
  const normalized = normalizeSecretKey(key);
  if (!normalized) return;
  const secrets = loadStoredSecrets();
  delete secrets[normalized];
  saveStoredSecrets(secrets);
}

function envSecretOverrides(): SecretMap {
  const overrides: SecretMap = {};
  if (typeof process.env.GITHUB_TOKEN === "string" && process.env.GITHUB_TOKEN.trim()) {
    overrides.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("TZ_SECRET_")) continue;
    if (typeof value !== "string" || !value.trim()) continue;
    const normalized = normalizeSecretKey(name.slice("TZ_SECRET_".length));
    if (!normalized) continue;
    overrides[normalized] = value;
  }
  return overrides;
}

export function getSecretValue(key: string): string | undefined {
  const normalized = normalizeSecretKey(key);
  if (!normalized) return undefined;
  const env = envSecretOverrides();
  if (typeof env[normalized] === "string") return env[normalized];
  const stored = loadStoredSecrets();
  return stored[normalized];
}

export function isSecretAvailable(key: string): boolean {
  const value = getSecretValue(key);
  return typeof value === "string" && value.trim().length > 0;
}

export function getSecretsForInterpolation(): SecretMap {
  return { ...loadStoredSecrets(), ...envSecretOverrides() };
}
