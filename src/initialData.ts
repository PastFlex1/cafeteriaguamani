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

