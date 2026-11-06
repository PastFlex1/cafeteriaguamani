/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ingredient, MenuItem, Employee, Sale, Expense } from './types';

export const initialIngredients: Ingredient[] = [];

export const initialMenuItems: MenuItem[] = [];

export const initialEmployees: Employee[] = [
  { id: 'emp_1', name: 'GUERRERO CARDENAS ALEJANDRA ESTEFANIA', role: 'Administrador', status: 'active', pin: '1234' },
];

export const generateHistoricalSales = (): Sale[] => {
  return [];
};

export const initialExpenses: Expense[] = [];

export const defaultCompanyConfig = {
  ruc: '',
  razonSocial: 'MOCCAPRICHO CAFETERIA',
  nombreComercial: 'MOCCAPRICHO',
  email: '',
  telefono: '',
  dirMatriz: 'Quito, Ecuador',
  dirEstablecimiento: 'Quito, Ecuador',
  codigoEstablecimiento: '001',
  puntoEmision: '001',
  secuencialFactura: 1,
  secuencialNotaVenta: 1,
  ambiente: '1' as const,
  tipoEmision: '1' as const,
  regimenTributario: 'RIMPE_NEGOCIO_POPULAR' as const,
  obligadoContabilidad: 'NO' as const,
  tarifaIvaPredeterminada: 15,
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
  smtpFromName: 'MOCCAPRICHO - Facturación Electrónica',
  smtpAutoSend: true,
};

