import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

interface FirebaseServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

function normalizePrivateKey(value: string | undefined) {
  let privateKey = value?.trim() || "";

  if (
    (privateKey.startsWith("\"") && privateKey.endsWith("\"")) ||
    (privateKey.startsWith("'") && privateKey.endsWith("'"))
  ) {
    try {
      privateKey = JSON.parse(privateKey) as string;
    } catch {
      privateKey = privateKey.slice(1, -1);
    }
  }

  return privateKey
    .replaceAll("\\\\n", "\n")
    .replaceAll("\\n", "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function parseServiceAccountJson(raw: string, source: string) {
  const parsed = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(`${source} is missing required Firebase service-account fields.`);
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: normalizePrivateKey(parsed.private_key),
  } satisfies FirebaseServiceAccount;
}

export function hasFirebaseCredentialShape() {
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH?.trim();
  const base64Json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  return Boolean(jsonPath || base64Json || (projectId && clientEmail && privateKey));
}

async function readServiceAccountFromFile() {
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH?.trim();

  if (!jsonPath) {
    return null;
  }

  let raw: string;

  try {
    raw = await readFile(jsonPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }

  return parseServiceAccountJson(raw, "The Firebase service account JSON file");
}

function readServiceAccountFromBase64Env() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();

  if (!encoded) {
    return null;
  }

  const normalized = encoded.replace(/\s+/g, "");
  const raw = Buffer.from(normalized, "base64").toString("utf-8");

  return parseServiceAccountJson(raw, "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64");
}

function readServiceAccountFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  } satisfies FirebaseServiceAccount;
}

let firebaseInitPromise: Promise<ReturnType<typeof initializeApp> | null> | null = null;

async function getServiceAccount() {
  return (await readServiceAccountFromFile()) ?? readServiceAccountFromBase64Env() ?? readServiceAccountFromEnv();
}

async function getFirebaseApp() {
  if (!firebaseInitPromise) {
    firebaseInitPromise = (async () => {
      const existing = getApps()[0];
      if (existing) {
        return existing;
      }

      const serviceAccount = await getServiceAccount();
      if (!serviceAccount) {
        return null;
      }

      return initializeApp({
        credential: cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim() || undefined,
      });
    })();
  }

  try {
    return await firebaseInitPromise;
  } catch (error) {
    firebaseInitPromise = null;
    throw error;
  }
}

export async function isFirebaseConfigured() {
  try {
    return Boolean(await getFirebaseApp());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Firebase initialization failed: ${message}`);
    return false;
  }
}

export async function getFirebaseFirestore() {
  const app = await getFirebaseApp();

  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const databaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID?.trim();

  if (databaseId) {
    return getFirestore(app, databaseId);
  }

  return getFirestore(app);
}

export async function getFirebaseStorageBucket() {
  const app = await getFirebaseApp();

  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  return getStorage(app).bucket();
}
