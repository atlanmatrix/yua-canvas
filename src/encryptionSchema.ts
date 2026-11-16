export type CipherBox = { iv: string; ciphertext: string };
export type LockProfile = {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: 600000;
  salt: string;
  check: CipherBox;
};
export type Envelope = {
  version: 1;
  id: string;
  profile: LockProfile;
  wrappedKey: CipherBox;
  dataIV: string;
  taskIds?: string[];
};
const base64 = (v: unknown, bytes: number) => {
  if (
    typeof v !== "string" ||
    v.length !== 4 * Math.ceil(bytes / 3) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(v)
  )
    return false;
  try {
    return atob(v).length === bytes;
  } catch {
    return false;
  }
};
const keys = (v: any, allowed: string[]) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).every((k) => allowed.includes(k));
const box = (v: any, bytes: number) =>
  keys(v, ["iv", "ciphertext"]) &&
  base64(v.iv, 12) &&
  base64(v.ciphertext, bytes);
export function validLockProfile(v: any): v is LockProfile {
  return (
    keys(v, ["version", "kdf", "iterations", "salt", "check"]) &&
    v.version === 1 &&
    v.kdf === "PBKDF2-SHA256" &&
    v.iterations === 600000 &&
    base64(v.salt, 16) &&
    box(v.check, 32)
  );
}
export function validEnvelope(v: any): v is Envelope {
  return (
    keys(v, ["version", "id", "profile", "wrappedKey", "dataIV", "taskIds"]) &&
    v.version === 1 &&
    typeof v.id === "string" &&
    /^[0-9a-f-]{36}$/i.test(v.id) &&
    validLockProfile(v.profile) &&
    box(v.wrappedKey, 48) &&
    base64(v.dataIV, 12) &&
    (v.taskIds === undefined ||
      (Array.isArray(v.taskIds) &&
        v.taskIds.length <= 100000 &&
        v.taskIds.every((id: unknown) => typeof id === "string")))
  );
}
