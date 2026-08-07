/**
 * Utility functions for formatting and other operations.
 */

export function formatNum(val: number, decimals: number = 2): string {
  const targetDecimals = Math.min(decimals, 2);
  if (val === undefined || val === null || isNaN(val)) {
    return '0' + (targetDecimals > 0 ? ',' + '0'.repeat(targetDecimals) : '');
  }
  // format with the specified number of decimal places (capped at 2) and replace dot with comma
  return val.toFixed(targetDecimals).replace('.', ',');
}

export function parseNum(val: string | number): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  // Replace comma with dot for correct parseFloat parsing
  const clean = val.replace(',', '.');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

export function removeUndefined<T>(obj: T): T {
  if (obj === undefined) return undefined as any;
  if (obj === null) return null as any;
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item)) as any;
  }
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = (obj as any)[key];
        if (val !== undefined) {
          newObj[key] = removeUndefined(val);
        }
      }
    }
    return newObj as T;
  }
  return obj;
}

