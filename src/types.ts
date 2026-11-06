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
  tarifaIva?: number; // 15 o 0 (por defecto 15% desglosado)
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
  tarifaIva?: number; // 15, 8, 5 o 0 (desglosado del precio)
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
  taxRate?: number;
  tax?: number;
  documentType?: 'nota_venta' | 'factura';
  accessKey?: string;
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

export type TaxRegime = 'GENERAL' | 'RIMPE_EMPRENDEDOR' | 'RIMPE_NEGOCIO_POPULAR' | 'ARTESANO_CALIFICADO';

export interface CompanyConfig {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  email: string;
  telefono: string;
  dirMatriz: string;
  dirEstablecimiento: string;
  codigoEstablecimiento: string; // ej: '001'
  puntoEmision: string; // ej: '001'
  secuencialFactura: number;
  secuencialNotaVenta: number;
  ambiente: '1' | '2'; // 1: Pruebas, 2: Producción
  tipoEmision: '1'; // 1: Normal
  regimenTributario: TaxRegime;
  obligadoContabilidad: 'SI' | 'NO';
  agenteRetencion?: string;
  contribuyenteEspecial?: string;
  tarifaIvaPredeterminada: number; // 15, 0, 5
  firmaElectronicaBase64?: string;
  firmaElectronicaNombre?: string;
  firmaElectronicaClave?: string;
  logoUrl?: string;
  // Configuración Servidor SMTP para envío de RIDE, XML Autorizado y Notas de Venta
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFromName?: string;
  smtpAutoSend?: boolean;
}

export type VatRateType = 15 | 5 | 0 | 'NO_OBJETO' | 'EXENTO';

export interface InvoiceItem {
  id: string;
  codigoPrincipal: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  tarifaIva: VatRateType;
  precioTotalSinImpuesto: number;
  valorIva: number;
  valorTotal: number;
  cuentaVentasId?: string;
}

export interface PaymentDetail {
  formaPago: string;
  total: number;
  plazo?: number;
  unidadTiempo?: string;
  numeroTransferencia?: string;
}

export interface ElectronicInvoice {
  id: string;
  tipoDocumento: string; // '01'
  establecimiento: string;
  puntoEmision: string;
  secuencial: string;
  numeroComprobante: string; // ej: 001-001-000000001
  claveAcceso: string; // 49 digitos
  fechaEmision: string; // YYYY-MM-DD
  cliente: {
    id?: string;
    identificacion: string;
    tipoIdentificacion?: string; // '04', '05', '06', '07'
    razonSocial: string;
    direccion: string;
    telefono?: string;
    email: string;
  };
  items: InvoiceItem[];
  subtotal15: number;
  subtotal5: number;
  subtotal0: number;
  subtotalNoObjeto: number;
  subtotalExento: number;
  totalDescuento: number;
  subtotalSinImpuestos: number;
  totalIva: number;
  propina: number;
  importeTotal: number;
  pagos: PaymentDetail[];
  estado: 'AUTORIZADO' | 'PENDIENTE' | 'DEVUELTA' | 'ANULADO';
  numeroAutorizacion?: string;
  fechaAutorizacion?: string;
  observaciones?: string;
  xml?: string;
  asientoId?: string;
}

export interface CreditNote {
  id: string;
  tipoDocumento: string; // '04'
  establecimiento: string;
  puntoEmision: string;
  secuencial: string;
  numeroComprobante: string;
  claveAcceso: string;
  fechaEmision: string;
  documentoModificado: {
    tipo: string;
    numero: string;
    fechaEmision: string;
  };
  tipoMotivo: string;
  motivo: string;
  cliente: ElectronicInvoice['cliente'];
  items: InvoiceItem[];
  subtotal15: number;
  subtotal5: number;
  subtotal0: number;
  subtotalNoObjeto: number;
  subtotalExento: number;
  totalDescuento: number;
  subtotalSinImpuestos: number;
  totalIva: number;
  valorModificacion: number;
  estado: 'AUTORIZADO' | 'PENDIENTE' | 'ANULADO';
  numeroAutorizacion?: string;
  fechaAutorizacion?: string;
  observaciones?: string;
  reingresarInventario?: boolean;
  xml?: string;
}
