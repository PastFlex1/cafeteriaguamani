declare global {
  interface Window {
    sqliteApi?: {
      isElectron: boolean;
      getAll: (collection: string) => Promise<any[]>;
      getDoc: (collection: string, id: string) => Promise<any | null>;
      setDoc: (collection: string, id: string, data: any) => Promise<boolean>;
      deleteDoc: (collection: string, id: string) => Promise<boolean>;
      writeBatch: (ops: { type: 'set' | 'delete'; collection: string; id: string; data?: any }[]) => Promise<boolean>;
    };
  }
}

class SqliteService {
  private get isElectron(): boolean {
    return !!(window.sqliteApi && window.sqliteApi.isElectron);
  }

  private getStorageKey(collectionName: string): string {
    return `caf_${collectionName}`;
  }

  async getAll(collectionName: string): Promise<any[]> {
    if (this.isElectron && window.sqliteApi) {
      try {
        return await window.sqliteApi.getAll(collectionName);
      } catch (err) {
        console.error(`Error obteniendo colección ${collectionName} de SQLite:`, err);
        return [];
      }
    } else {
      const stored = localStorage.getItem(this.getStorageKey(collectionName));
      return stored ? JSON.parse(stored) : [];
    }
  }

  async getDoc(collectionName: string, id: string): Promise<any | null> {
    if (this.isElectron && window.sqliteApi) {
      try {
        return await window.sqliteApi.getDoc(collectionName, id);
      } catch (err) {
        console.error(`Error obteniendo doc ${collectionName}/${id} de SQLite:`, err);
        return null;
      }
    } else {
      const items = await this.getAll(collectionName);
      return items.find(item => item.id === id) || null;
    }
  }

  async setDoc(collectionName: string, id: string, data: any): Promise<void> {
    if (this.isElectron && window.sqliteApi) {
      try {
        await window.sqliteApi.setDoc(collectionName, id, data);
      } catch (err) {
        console.error(`Error guardando doc ${collectionName}/${id} en SQLite:`, err);
      }
    } else {
      const items = await this.getAll(collectionName);
      const idx = items.findIndex(item => item.id === id);
      if (idx > -1) {
        items[idx] = data;
      } else {
        items.push(data);
      }
      localStorage.setItem(this.getStorageKey(collectionName), JSON.stringify(items));
    }
  }

  async deleteDoc(collectionName: string, id: string): Promise<void> {
    if (this.isElectron && window.sqliteApi) {
      try {
        await window.sqliteApi.deleteDoc(collectionName, id);
      } catch (err) {
        console.error(`Error eliminando doc ${collectionName}/${id} en SQLite:`, err);
      }
    } else {
      let items = await this.getAll(collectionName);
      items = items.filter(item => item.id !== id);
      localStorage.setItem(this.getStorageKey(collectionName), JSON.stringify(items));
    }
  }

  async writeBatch(ops: { type: 'set' | 'delete'; collection: string; id: string; data?: any }[]): Promise<void> {
    if (this.isElectron && window.sqliteApi) {
      try {
        await window.sqliteApi.writeBatch(ops);
      } catch (err) {
        console.error('Error ejecutando batch en SQLite:', err);
      }
    } else {
      const collectionsMap = new Map<string, any[]>();

      for (const op of ops) {
        if (!collectionsMap.has(op.collection)) {
          collectionsMap.set(op.collection, await this.getAll(op.collection));
        }
        const items = collectionsMap.get(op.collection)!;

        if (op.type === 'set') {
          const idx = items.findIndex(item => item.id === op.id);
          if (idx > -1) {
            items[idx] = op.data;
          } else {
            items.push(op.data);
          }
        } else if (op.type === 'delete') {
          const nextItems = items.filter(item => item.id !== op.id);
          collectionsMap.set(op.collection, nextItems);
        }
      }

      for (const [colName, items] of collectionsMap.entries()) {
        localStorage.setItem(this.getStorageKey(colName), JSON.stringify(items));
      }
    }
  }
}

export const sqliteService = new SqliteService();
