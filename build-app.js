import { rename as originalRename, rm, cp } from 'node:fs/promises';
import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import { build } from 'electron-builder';
import { execSync } from 'node:child_process';

// Patch fs.promises.rename to fallback to recursive copy if Windows rename fails (EPERM / EBUSY)
fsPromises.rename = async (oldPath, newPath) => {
  try {
    if (fs.existsSync(newPath)) {
      await rm(newPath, { recursive: true, force: true }).catch(() => {});
    }
    return await originalRename(oldPath, newPath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES' || err.code === 'EXDEV') {
      console.log(`[Patch] fs.rename encountered ${err.code}. Fallback: Copying ${oldPath} -> ${newPath}`);
      if (fs.existsSync(newPath)) {
        await rm(newPath, { recursive: true, force: true }).catch(() => {});
      }
      await cp(oldPath, newPath, { recursive: true, force: true });
      await rm(oldPath, { recursive: true, force: true }).catch(() => {});
      return;
    }
    throw err;
  }
};

async function run() {
  try {
    console.log('--- Step 1: Cleaning previous output ---');
    if (fs.existsSync('release')) {
      await rm('release', { recursive: true, force: true }).catch(() => {});
    }

    console.log('--- Step 2: Building Vite Frontend ---');
    execSync('npx vite build', { stdio: 'inherit' });

    console.log('--- Step 3: Running Electron Builder ---');
    const result = await build({
      config: {
        appId: 'com.cafeteria.pos',
        productName: 'Control de Cafeteria',
        directories: { output: 'release' },
        files: ['dist/**/*', 'electron/**/*'],
        win: { target: ['nsis', 'portable'] }
      }
    });

    console.log('🎉 ¡Empaquetado completado exitosamente!');
    console.log('Archivos generados en release/:');
    result.forEach(f => console.log('  -', f));
  } catch (err) {
    console.error('❌ Build failed:', err);
    process.exit(1);
  }
}

run();
