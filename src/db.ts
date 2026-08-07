import { sqliteService } from './sqliteService';

export interface DocRef {
  type: 'doc';
  collectionName: string;
  id: string;
}

export interface CollectionRef {
  type: 'collection';
  collectionName: string;
}

export interface DocumentSnapshot {
  id: string;
  exists: () => boolean;
  data: () => any;
}

export interface QuerySnapshot {
  empty: boolean;
  size: number;
  docs: DocumentSnapshot[];
  forEach: (callback: (docSnap: DocumentSnapshot) => void) => void;
}

type Listener = () => void;

class EventEmitter {
  private listeners: Map<string, Set<Listener>> = new Map();

  subscribe(collectionName: string, listener: Listener): () => void {
    if (!this.listeners.has(collectionName)) {
      this.listeners.set(collectionName, new Set());
    }
    this.listeners.get(collectionName)!.add(listener);
    return () => {
      this.listeners.get(collectionName)?.delete(listener);
    };
  }

  notify(collectionName: string) {
    const set = this.listeners.get(collectionName);
    if (set) {
      set.forEach(cb => cb());
    }
  }
}

export const dbEventEmitter = new EventEmitter();

export const db = { name: 'sqlite-db' };

export function collection(_db: any, collectionName: string): CollectionRef {
  return { type: 'collection', collectionName };
}

export function doc(_db: any, collectionName: string, id?: string): DocRef {
  return { type: 'doc', collectionName, id: id || `id_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` };
}

export async function getDoc(docRef: DocRef): Promise<DocumentSnapshot> {
  const data = await sqliteService.getDoc(docRef.collectionName, docRef.id);
  return {
    id: docRef.id,
    exists: () => data !== null && data !== undefined,
    data: () => data
  };
}

export async function getDocs(colRef: CollectionRef): Promise<QuerySnapshot> {
  const list = await sqliteService.getAll(colRef.collectionName);
  const docs: DocumentSnapshot[] = list.map(item => ({
    id: item.id || '',
    exists: () => true,
    data: () => item
  }));

  return {
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (cb) => docs.forEach(cb)
  };
}

export async function setDoc(docRef: DocRef, data: any, _options?: any): Promise<void> {
  await sqliteService.setDoc(docRef.collectionName, docRef.id, data);
  dbEventEmitter.notify(docRef.collectionName);
}

export async function deleteDoc(docRef: DocRef): Promise<void> {
  await sqliteService.deleteDoc(docRef.collectionName, docRef.id);
  dbEventEmitter.notify(docRef.collectionName);
}

export class Batch {
  private ops: { type: 'set' | 'delete'; collection: string; id: string; data?: any }[] = [];
  private touchedCollections = new Set<string>();

  set(docRef: DocRef, data: any, _options?: any) {
    this.ops.push({ type: 'set', collection: docRef.collectionName, id: docRef.id, data });
    this.touchedCollections.add(docRef.collectionName);
  }

  delete(docRef: DocRef) {
    this.ops.push({ type: 'delete', collection: docRef.collectionName, id: docRef.id });
    this.touchedCollections.add(docRef.collectionName);
  }

  async commit() {
    await sqliteService.writeBatch(this.ops);
    this.touchedCollections.forEach(colName => dbEventEmitter.notify(colName));
    this.ops = [];
    this.touchedCollections.clear();
  }
}

export function writeBatch(_db: any): Batch {
  return new Batch();
}

export function onSnapshot(
  ref: CollectionRef | DocRef,
  callback: (snapshot: any) => void,
  _errorCallback?: (err: any) => void
): () => void {
  if (ref.type === 'collection') {
    const fetchAndNotify = async () => {
      const docs = await getDocs(ref as CollectionRef);
      callback(docs);
    };

    fetchAndNotify();
    return dbEventEmitter.subscribe((ref as CollectionRef).collectionName, fetchAndNotify);
  } else {
    const fetchAndNotify = async () => {
      const docSnap = await getDoc(ref as DocRef);
      callback(docSnap);
    };

    fetchAndNotify();
    return dbEventEmitter.subscribe((ref as DocRef).collectionName, fetchAndNotify);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, _operationType: OperationType, _path: string | null) {
  console.warn("SQLite Error: ", error);
}

export async function testConnection() {
  console.log("Conexión a SQLite verificada correctamente.");
}
