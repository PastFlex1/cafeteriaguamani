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
  private isElectron = !!(window.sqliteApi && window.sqliteApi.isElectron);

  async getAll(collectionName: string): Promise<any[]> {
    if (this.isElectron && window.sqliteApi) {
      return await window.sqliteApi.getAll(collectionName);
    } else {
      const stored = localStorage.getItem(`sqlite_${collectionName}`);
      return stored ? JSON.parse(stored) : [];
    }
  }

  async getDoc(collectionName: string, id: string): Promise<any | null> {
    if (this.isElectron && window.sqliteApi) {
      return await window.sqliteApi.getDoc(collectionName, id);
    } else {
      const items = await this.getAll(collectionName);
      return items.find(item => item.id === id) || null;
    }
  }

  async setDoc(collectionName: string, id: string, data: any): Promise<void> {
    if (this.isElectron && window.sqliteApi) {
      await window.sqliteApi.setDoc(collectionName, id, data);
    } else {
      const items = await this.getAll(collectionName);
      const idx = items.findIndex(item => item.id === id);
      if (idx > -1) {
        items[idx] = data;
      } else {
        items.push(data);
      }
      localStorage.setItem(`sqlite_${collectionName}`, JSON.stringify(items));
    }
  }

  async deleteDoc(collectionName: string, id: string): Promise<void> {
    if (this.isElectron && window.sqliteApi) {
      await window.sqliteApi.deleteDoc(collectionName, id);
    } else {
      let items = await this.getAll(collectionName);
      items = items.filter(item => item.id !== id);
      localStorage.setItem(`sqlite_${collectionName}`, JSON.stringify(items));
    }
  }

  async writeBatch(ops: { type: 'set' | 'delete'; collection: string; id: string; data?: any }[]): Promise<void> {
    if (this.isElectron && window.sqliteApi) {
      await window.sqliteApi.writeBatch(ops);
    } else {
      for (const op of ops) {
        if (op.type === 'set') {
          await this.setDoc(op.collection, op.id, op.data);
        } else if (op.type === 'delete') {
          await this.deleteDoc(op.collection, op.id);
        }
      }
    }
  }
}

export const sqliteService = new SqliteService();
