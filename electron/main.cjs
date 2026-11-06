const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { sendSmtpEmail } = require('./smtpSender.cjs');

let db = null;
let Database = null;

try {
  Database = require('better-sqlite3');
} catch (err) {
  console.warn('better-sqlite3 no disponible, se intentará usar respaldo alternativo:', err.message);
}

// Fallback in-memory / JSON file store if native sqlite binary fails to load
class SimpleJsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    if (fs.existsSync(this.filePath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      } catch (e) {
        this.data = {};
      }
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error('Error guardando store JSON:', e);
    }
  }

  getAll(collection) {
    const col = this.data[collection] || {};
    return Object.values(col);
  }

  getDoc(collection, id) {
    const col = this.data[collection] || {};
    return col[id] || null;
  }

  setDoc(collection, id, itemData) {
    if (!this.data[collection]) this.data[collection] = {};
    this.data[collection][id] = itemData;
    this.save();
  }

  deleteDoc(collection, id) {
    if (this.data[collection] && this.data[collection][id]) {
      delete this.data[collection][id];
      this.save();
    }
  }

  writeBatch(ops) {
    for (const op of ops) {
      if (op.type === 'set') {
        this.setDoc(op.collection, op.id, op.data);
      } else if (op.type === 'delete') {
        this.deleteDoc(op.collection, op.id);
      }
    }
  }
}

let jsonStoreFallback = null;

function initDatabase() {
  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  const dbPath = path.join(userDataPath, 'cafeteria.db');
  console.log('Ruta de Base de Datos SQLite:', dbPath);

  if (Database) {
    try {
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.exec(`
        CREATE TABLE IF NOT EXISTS store (
          collection TEXT NOT NULL,
          id TEXT NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (collection, id)
        );
      `);
      console.log('SQLite (better-sqlite3) inicializado correctamente.');
      return;
    } catch (err) {
      console.error('Error inicializando better-sqlite3:', err);
    }
  }

  const jsonPath = path.join(userDataPath, 'cafeteria_store.json');
  console.log('Usando almacenamiento en archivo JSON local:', jsonPath);
  jsonStoreFallback = new SimpleJsonStore(jsonPath);
}

function getAllDocs(collection) {
  if (db) {
    const stmt = db.prepare('SELECT data FROM store WHERE collection = ?');
    const rows = stmt.all(collection);
    return rows.map(r => JSON.parse(r.data));
  } else if (jsonStoreFallback) {
    return jsonStoreFallback.getAll(collection);
  }
  return [];
}

function getSingleDoc(collection, id) {
  if (db) {
    const stmt = db.prepare('SELECT data FROM store WHERE collection = ? AND id = ?');
    const row = stmt.get(collection, id);
    return row ? JSON.parse(row.data) : null;
  } else if (jsonStoreFallback) {
    return jsonStoreFallback.getDoc(collection, id);
  }
  return null;
}

function setSingleDoc(collection, id, data) {
  const jsonStr = JSON.stringify(data);
  if (db) {
    const stmt = db.prepare(`
      INSERT INTO store (collection, id, data)
      VALUES (?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data
    `);
    stmt.run(collection, id, jsonStr);
  } else if (jsonStoreFallback) {
    jsonStoreFallback.setDoc(collection, id, data);
  }
}

function deleteSingleDoc(collection, id) {
  if (db) {
    const stmt = db.prepare('DELETE FROM store WHERE collection = ? AND id = ?');
    stmt.run(collection, id);
  } else if (jsonStoreFallback) {
    jsonStoreFallback.deleteDoc(collection, id);
  }
}

function executeBatch(ops) {
  if (db) {
    const insertStmt = db.prepare(`
      INSERT INTO store (collection, id, data)
      VALUES (?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data
    `);
    const deleteStmt = db.prepare('DELETE FROM store WHERE collection = ? AND id = ?');

    const transaction = db.transaction((operations) => {
      for (const op of operations) {
        if (op.type === 'set') {
          insertStmt.run(op.collection, op.id, JSON.stringify(op.data));
        } else if (op.type === 'delete') {
          deleteStmt.run(op.collection, op.id);
        }
      }
    });

    transaction(ops);
  } else if (jsonStoreFallback) {
    jsonStoreFallback.writeBatch(ops);
  }
}

// Setup IPC listeners
ipcMain.handle('sqlite:get-all', async (_event, collection) => {
  return getAllDocs(collection);
});

ipcMain.handle('sqlite:get-doc', async (_event, collection, id) => {
  return getSingleDoc(collection, id);
});

ipcMain.handle('sqlite:set-doc', async (_event, collection, id, data) => {
  setSingleDoc(collection, id, data);
  return true;
});

ipcMain.handle('sqlite:delete-doc', async (_event, collection, id) => {
  deleteSingleDoc(collection, id);
  return true;
});

ipcMain.handle('sqlite:write-batch', async (_event, ops) => {
  executeBatch(ops);
  return true;
});

ipcMain.handle('smtp:send-email', async (_event, payload) => {
  try {
    return await sendSmtpEmail(payload);
  } catch (err) {
    return { success: false, error: err.message || 'Error al enviar correo SMTP.' };
  }
});

// IPC handler para consulta unificada de SRI (Cédula, RUC, Pasaporte)
ipcMain.handle('sri:consultar-identificacion', async (_event, rawId) => {
  const cleanDigits = (rawId || '').trim().replace(/\D/g, '');
  const cleanId = (rawId || '').trim();
  if (!cleanId) return { success: false, found: false, error: 'Identificación requerida.' };

  const isCedula = cleanDigits.length === 10;
  const isRuc = cleanDigits.length === 13;
  const tipo = isCedula ? 'C' : isRuc ? 'R' : 'P';
  const targetId = isCedula || isRuc ? cleanDigits : cleanId.toUpperCase();
  const tipoDocumento = isCedula ? 'CEDULA' : isRuc ? 'RUC' : 'PASAPORTE';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
  };

  let foundName = '';
  let foundTipoPersona = null;
  let foundRucData = null;
  let fuenteUsada = '';

  // 1. SRI Persona
  try {
    const personaUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${encodeURIComponent(targetId)}&tipoIdentificacion=${tipo}`;
    const resPersona = await fetch(personaUrl, { headers, signal: AbortSignal.timeout(5000) });
    if (resPersona.status === 200) {
      const pData = await resPersona.json();
      if (pData && pData.nombreCompleto) {
        foundName = pData.nombreCompleto.trim();
        foundTipoPersona = pData.tipoPersona || null;
        fuenteUsada = 'SRI Persona';
      }
    }
  } catch (e) {}

  // 2. SRI RUC Catastro
  if (!foundName || isRuc) {
    try {
      const rucNum = isCedula ? `${targetId}001` : targetId;
      const rucUrl = `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${encodeURIComponent(rucNum)}`;
      const resRuc = await fetch(rucUrl, { headers, signal: AbortSignal.timeout(5000) });
      if (resRuc.status === 200) {
        const list = await resRuc.json();
        const record = Array.isArray(list) ? list[0] : list;
        if (record && record.razonSocial) {
          if (!foundName) {
            foundName = record.razonSocial.trim();
            foundTipoPersona = record.tipoContribuyente || null;
            fuenteUsada = 'SRI Catastro RUC';
          }
          foundRucData = record;
        }
      }
    } catch (e) {}
  }

  // 3. SRI Móvil Deudas
  if (!foundName) {
    try {
      const deudasUrl = `https://srienlinea.sri.gob.ec/movil-servicios/api/v1.0/deudas/porIdentificacion/${encodeURIComponent(targetId)}`;
      const resDeudas = await fetch(deudasUrl, { headers, signal: AbortSignal.timeout(5000) });
      if (resDeudas.status === 200) {
        const deudasData = await resDeudas.json();
        if (deudasData) {
          let extractedName = '';
          if (deudasData.contribuyente && typeof deudasData.contribuyente === 'object') {
            extractedName = deudasData.contribuyente.razonSocial || deudasData.contribuyente.nombreComercial || deudasData.contribuyente.denominacion || '';
          } else if (typeof deudasData.contribuyente === 'string') {
            extractedName = deudasData.contribuyente;
          } else {
            extractedName = deudasData.nombreCompleto || deudasData.razonSocial || '';
          }
          if (extractedName && typeof extractedName === 'string') {
            foundName = extractedName.trim();
            fuenteUsada = 'SRI Móvil';
          }
        }
      }
    } catch (e) {}
  }

  // 4. SECAP Fallback
  if (!foundName && isCedula) {
    try {
      const secapTarget = 'https://si.secap.gob.ec/sisecap/logeo_web/json/busca_persona_registro_civil.php';
      const secapRes = await fetch(secapTarget, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ documento: targetId, tipo: '1' }),
        signal: AbortSignal.timeout(4000)
      });
      if (secapRes.ok) {
        const text = await secapRes.text();
        if (text && !text.trim().startsWith('<')) {
          try {
            const secapData = JSON.parse(text);
            if (secapData?.nombreCompleto) foundName = secapData.nombreCompleto.trim();
            else if (secapData?.nombre) foundName = secapData.nombre.trim();
            else if (secapData?.nombres && secapData?.apellidos) foundName = `${secapData.apellidos} ${secapData.nombres}`.trim();
            if (foundName) fuenteUsada = 'Registro Civil SECAP';
          } catch {}
        }
      }
    } catch (e) {}
  }

  if (foundName) {
    const finalName = foundName.trim().toUpperCase();
    return {
      success: true,
      found: true,
      identificacion: targetId,
      nombre: finalName,
      nombreCompleto: finalName,
      razonSocial: foundRucData?.razonSocial || finalName,
      nombreComercial: foundRucData?.nombreComercial || '',
      tipoPersona: foundTipoPersona,
      tipoDocumento,
      estado: foundRucData?.estadoContribuyenteRuc || foundRucData?.estado || 'ACTIVO',
      actividadEconomica: foundRucData?.actividadEconomicaPrincipal || '',
      regimen: foundRucData?.regimen || '',
      obligadoContabilidad: foundRucData?.obligadoLlevarContabilidad || '',
      fuente: fuenteUsada,
      rucData: foundRucData,
    };
  }

  return {
    success: false,
    found: false,
    identificacion: targetId,
    nombre: '',
    tipoDocumento,
    error: `No se encontraron datos en el SRI para la identificación ${targetId}.`
  };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Control de Cafetería',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    }
  });

  win.setMenu(null); // Clean window without default menu bar

  const startUrl = process.env.VITE_DEV_SERVER_URL || `file://${path.join(__dirname, '../dist/index.html')}`;

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(startUrl);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (db) {
    try {
      db.close();
    } catch (e) {
      console.error('Error cerrando la base de datos:', e);
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
