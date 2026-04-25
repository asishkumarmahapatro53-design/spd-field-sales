import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

interface FirebaseServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

async function readServiceAccountFromFile() {
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PATH?.trim();

  if (!jsonPath) {
    return null;
  }

  const raw = await readFile(jsonPath, "utf-8");
  const parsed = JSON.parse(raw) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("The Firebase service account JSON file is missing required fields.");
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  } satisfies FirebaseServiceAccount;
}

function readServiceAccountFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replaceAll("\\n", "\n");

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
  return (await readServiceAccountFromFile()) ?? readServiceAccountFromEnv();
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

  return firebaseInitPromise;
}

export async function isFirebaseConfigured() {
  return Boolean(await getFirebaseApp());
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
