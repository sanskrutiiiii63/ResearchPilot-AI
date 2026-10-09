import { firestore } from "./config/firebase.js";

export const now = () => new Date().toISOString();

function query(collection, filters) {
  let q = firestore.collection(collection);
  for (const [field, value] of filters) q = q.where(field, "==", value);
  return q;
}

// Returns the document only if it belongs to this user, otherwise null.
export async function getOwned(collection, id, uid) {
  const snap = await firestore.collection(collection).doc(id).get();
  if (!snap.exists || snap.data().ownerId !== uid) return null;
  return { id: snap.id, ...snap.data() };
}

// Equality-only filters need no composite indexes. Sort in memory.
export async function listWhere(collection, filters) {
  const snap = await query(collection, filters).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function countWhere(collection, filters) {
  const snap = await query(collection, filters).count().get();
  return snap.data().count;
}

export async function deleteWhere(collection, filters) {
  const snap = await query(collection, filters).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = firestore.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export const byNewest = (a, b) => (a.createdAt < b.createdAt ? 1 : -1);
export const byOldest = (a, b) => (a.createdAt > b.createdAt ? 1 : -1);
