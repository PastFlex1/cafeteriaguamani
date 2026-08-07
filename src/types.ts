/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CategoryType = 
  | 'cafes' 
  | 'reposteria' 
  | 'bebidas_frias' 
  | 'alimentos' 
  | 'combos'
  | 'cafe_caliente'
  | 'tes_infusiones'
  | 'bebidas_frias_frappes'
  | 'zumos_jugos'
  | 'bebidas_envasadas'
  | 'bebidas_alcoholicas'
  | 'gaseosas';

export interface IngredientRequirement {
  ingredientId: string;
  quantity: number; // Quantity needed per product unit
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  cost: number; // Cost of ingredients/materials
  category: CategoryType;
  description: string;
  status: 'active' | 'inactive';
  ingredients: IngredientRequirement[];
  stock?: number;
}

export interface Ingredient {
  id: string;
  name: string;
  stock: number;
  minStock: number; // Safety stock alert threshold
  unit: string; // 'g', 'ml', 'pz', etc.
  costPerUnit: number; // Cost of buying 1 unit
}

export interface CustomerDetails {
  name: string;
  documentId: string; // Cédula, RUC o Pasaporte
  phone: string;
  address: string;
  email: string;
}

export interface SaleItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  cost: number;
  discountPercent?: number;
}

export interface Sale {
  id: string;
  invoiceNumber?: string; // e.g. #000001
  timestamp: string; // ISO String
  items: SaleItem[];
  total: number;
  cost: number; // Total cost to calculate profit margins
  paymentMethod: 'efectivo' | 'tarjeta' | 'transferencia';
  status: 'completed' | 'refunded' | 'voided';
  employeeId: string;
  employeeName: string;
  cashReceived?: number;
  changeGiven?: number;
  transferNumber?: string;
  customer?: CustomerDetails;
  discount?: number;
  subtotal?: number;
}

export interface Employee {
  id: string;
  name: string;
  role: 'Administrador' | 'Cocinero' | 'Cajero';
  status: 'active' | 'inactive';
  pin: string; // 4 digits
}

export interface Shift {
  id: string;
  employeeId: string;
  employeeName: string;
  startTime: string; // ISO String
  endTime?: string;  // ISO String
  cashStart: number;
  cashEndExpected?: number;
  cashEndActual?: number;
  transfersExpected?: number;
  transfersActual?: number;
  status: 'open' | 'closed';
}

export interface Expense {
  id: string;
  timestamp: string;
  description: string;
  category: 'insumos' | 'servicios' | 'renta' | 'otros';
  amount: number;
}
