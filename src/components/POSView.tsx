/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CreditCard,
  Receipt,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Printer,
  Coffee,
  FileText,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Send,
  KeyRound,
  Download,
  Eye,
  Mail
} from 'lucide-react';
import { MenuItem, Ingredient, SaleItem, Sale, Shift, Employee, CustomerDetails, CompanyConfig } from '../types';
import { formatNum, parseNum } from '../utils';
import { consultarIdentificacionSri } from '../utils/sriConsultas';
import { generateAccessKey } from '../utils/sriCalculations';
import { exportSaleRidePdf, exportNotaVentaPdf, saleToElectronicInvoice } from '../utils/sriPdfGenerator';
import { isSmtpConfigured, sendSaleComprobanteEmail } from '../utils/emailService';
import RidePreviewModal from './RidePreviewModal';

interface POSViewProps {
  businessName: string;
  menuItems: MenuItem[];
  ingredients: Ingredient[];
  activeShift: Shift | null;
  activeEmployee: Employee | null;
  shiftsHistory: Shift[];
  sales: Sale[];
  customers?: CustomerDetails[];
  company?: CompanyConfig;
  onRegisterSale: (
    saleItems: SaleItem[],
    paymentMethod: 'efectivo' | 'tarjeta' | 'transferencia',
    cashReceived?: number,
    changeGiven?: number,
    transferNumber?: string,
    customer?: CustomerDetails,
    invoiceNumber?: string,
    discount?: number,
    taxRate?: number,
    documentType?: 'nota_venta' | 'factura',
    accessKey?: string
  ) => void;
  onSaveCustomer?: (customer: CustomerDetails) => void;
  onUpdateCompany?: (company: CompanyConfig) => void;
}

export const validarDocumentoEcuatoriano = (doc: string): { valido: boolean; tipo: string; mensaje?: string } => {
  const clean = doc.trim();
  if (!clean) return { valido: false, tipo: 'Desconocido', mensaje: 'Campo vacío' };

  if (clean === '9999999999') {
    return { valido: true, tipo: 'Consumidor Final', mensaje: 'Autorizado para consumidor final' };
  }

  // Passport validation: Alphanumeric between 5 and 15 characters, must have letters or not match 10/13 digits to distinguish
  const containsLetters = /[A-Z]/i.test(clean);
  if (containsLetters && clean.length >= 5 && clean.length <= 15) {
    return { valido: true, tipo: 'Pasaporte', mensaje: 'Formato de pasaporte verificado' };
  }

  if (!/^\d+$/.test(clean)) {
    return { valido: false, tipo: 'Desconocido', mensaje: 'El documento debe contener solo números o ser un pasaporte' };
  }

  // 10 digits -> Cédula
  if (clean.length === 10) {
    const provincia = parseInt(clean.substring(0, 2), 10);
    if (provincia < 1 || (provincia > 24 && provincia !== 30)) {
      return { valido: false, tipo: 'Cédula', mensaje: 'Provincia inválida (los 2 primeros dígitos deben ser 01-24 o 30)' };
    }

    const tercerDigito = parseInt(clean.charAt(2), 10);
    if (tercerDigito >= 6) {
      return { valido: false, tipo: 'Cédula', mensaje: 'Tercer dígito inválido para cédula (debe ser menor a 6)' };
    }

    const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let suma = 0;
    for (let i = 0; i < 9; i++) {
      let valor = parseInt(clean.charAt(i), 10) * coeficientes[i];
      if (valor >= 10) {
        valor -= 9;
      }
      suma += valor;
    }

    const digitoVerificador = parseInt(clean.charAt(9), 10);
    const decenaSuperior = Math.ceil(suma / 10) * 10;
    let resta = decenaSuperior - suma;
    if (resta === 10) resta = 0;

    if (resta === digitoVerificador) {
      return { valido: true, tipo: 'Cédula', mensaje: 'Cédula de ciudadanía ecuatoriana válida' };
    } else {
      return { valido: false, tipo: 'Cédula', mensaje: 'Dígito verificador de cédula incorrecto' };
    }
  }

  // 13 digits -> RUC
  if (clean.length === 13) {
    const provincia = parseInt(clean.substring(0, 2), 10);
    if (provincia < 1 || (provincia > 24 && provincia !== 30)) {
      return { valido: false, tipo: 'RUC', mensaje: 'Provincia inválida (los 2 primeros dígitos deben ser 01-24 o 30)' };
    }

    const establecimiento = clean.substring(10, 13);
    if (establecimiento === '000') {
      return { valido: false, tipo: 'RUC', mensaje: 'Establecimiento inválido (los últimos 3 dígitos no pueden ser 000)' };
    }

    const tercerDigito = parseInt(clean.charAt(2), 10);

    // Persona Natural (natural person RUC) - third digit < 6
    if (tercerDigito < 6) {
      // First 10 digits must be a valid Cédula
      const cedulaPart = clean.substring(0, 10);
      const valCedula = validarDocumentoEcuatoriano(cedulaPart);
      if (valCedula.valido) {
        return { valido: true, tipo: 'RUC Persona Natural', mensaje: 'RUC de Persona Natural válido' };
      } else {
        return { valido: false, tipo: 'RUC Persona Natural', mensaje: `Cédula base inválida: ${valCedula.mensaje}` };
      }
    }

    // Persona Jurídica / Sociedad Privada - third digit is 9
    if (tercerDigito === 9) {
      const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
      let suma = 0;
      for (let i = 0; i < 9; i++) {
        suma += parseInt(clean.charAt(i), 10) * coeficientes[i];
      }
      const residuo = suma % 11;
      const digitoVerificador = residuo === 0 ? 0 : 11 - residuo;
      const decimoDigito = parseInt(clean.charAt(9), 10);

      if (digitoVerificador === decimoDigito) {
        return { valido: true, tipo: 'RUC Sociedad Privada', mensaje: 'RUC de Sociedad Privada / Extranjero válido' };
      } else {
        return { valido: false, tipo: 'RUC Sociedad Privada', mensaje: 'Dígito verificador de RUC Privado incorrecto' };
      }
    }

    // Institución Pública - third digit is 6
    if (tercerDigito === 6) {
      const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2];
      let suma = 0;
      for (let i = 0; i < 8; i++) {
        suma += parseInt(clean.charAt(i), 10) * coeficientes[i];
      }
      const residuo = suma % 11;
      const digitoVerificador = residuo === 0 ? 0 : 11 - residuo;
      const novenoDigito = parseInt(clean.charAt(8), 10);

      if (digitoVerificador === novenoDigito) {
        return { valido: true, tipo: 'RUC Público', mensaje: 'RUC de Institución Pública válido' };
      } else {
        return { valido: false, tipo: 'RUC Público', mensaje: 'Dígito verificador de RUC Público incorrecto' };
      }
    }

    return { valido: false, tipo: 'RUC', mensaje: 'Tercer dígito de RUC inválido' };
  }

  // If numeric but not 10 or 13 digits, could be a foreign identification or numeric passport
  if (clean.length >= 5 && clean.length <= 15) {
    return { valido: true, tipo: 'Pasaporte/ID', mensaje: 'Formato de identificación extranjera o pasaporte verificado' };
  }

  return { valido: false, tipo: 'Desconocido', mensaje: 'Longitud inválida (cédula 10, RUC 13 o pasaporte 5-15)' };
};

export default function POSView({
  businessName,
  menuItems,
  ingredients,
  activeShift,
  activeEmployee,
  shiftsHistory,
  sales,
  customers = [],
  company,
  onRegisterSale,
  onSaveCustomer,
  onUpdateCompany,
}: POSViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [cart, setCart] = useState<{ menuItem: MenuItem; quantity: number; discountPercent?: number }[]>([]);

  // Checkout & Ticket states
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [documentType, setDocumentType] = useState<'nota_venta' | 'factura'>('nota_venta');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [cashReceived, setCashReceived] = useState('');
  const [transferNumber, setTransferNumber] = useState('');
  const [recentSaleTicket, setRecentSaleTicket] = useState<Sale | null>(null);
  const [previewRideSale, setPreviewRideSale] = useState<Sale | null>(null);
  const [ticketEmailInput, setTicketEmailInput] = useState('');
  const [isSendingTicketEmail, setIsSendingTicketEmail] = useState(false);

  useEffect(() => {
    if (recentSaleTicket) {
      setTicketEmailInput(recentSaleTicket.customer?.email || '');
    }
  }, [recentSaleTicket]);
  
  // Ciclo oficial SRI (Firmando -> Recepción -> Autorización)
  const [sriCycle, setSriCycle] = useState<{
    active: boolean;
    step: 'signing' | 'reception' | 'authorization' | 'done';
    invoiceNumber: string;
    accessKey?: string;
    clientName: string;
    total: number;
  } | null>(null);

  // IVA Feriados 8% (Ecuador)
  const [applyHolidayIva8, setApplyHolidayIva8] = useState<boolean>(() => {
    return localStorage.getItem('caf_pos_iva8') === 'true';
  });

  const handleToggleHolidayIva8 = (checked: boolean) => {
    setApplyHolidayIva8(checked);
    localStorage.setItem('caf_pos_iva8', String(checked));
  };

  const isPrintingRef = React.useRef(false);
  const handleTriggerPrint = () => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;
    window.print();
    setTimeout(() => {
      isPrintingRef.current = false;
    }, 1200);
  };

  // Customer details states
  const [customerName, setCustomerName] = useState('');
  const [customerDocumentId, setCustomerDocumentId] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [isLoadedFromDb, setIsLoadedFromDb] = useState(false);

  // Retro modals for customer save
  const [retroConfirm, setRetroConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [retroToast, setRetroToast] = useState<string | null>(null);

  const showRetroToast = (msg: string) => {
    setRetroToast(msg);
    setTimeout(() => setRetroToast(null), 3000);
  };

  const [isSearchingCedula, setIsSearchingCedula] = useState(false);
  const [searchCedulaError, setSearchCedulaError] = useState<string | null>(null);

  const isCustomerAlreadySaved = customers && customerDocumentId.trim() !== '' && customerDocumentId.trim() !== '9999999999' &&
    customers.some(c => c.documentId.trim() === customerDocumentId.trim());

  const isConsumidorFinal =
    (customerDocumentId.trim() === '' && customerName.trim() === '') ||
    customerDocumentId.trim() === '9999999999' ||
    customerName.trim().toUpperCase() === 'CONSUMIDOR FINAL';

  const isValidEmail = (email: string) => {
    const clean = email.trim();
    return clean.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  };

  const isNameValid = isConsumidorFinal || customerName.trim().length > 0;
  const isDocValid = isConsumidorFinal || (
    customerDocumentId.trim().length > 0 &&
    validarDocumentoEcuatoriano(customerDocumentId).valido
  );
  const isPhoneValid = isConsumidorFinal || customerPhone.trim().length > 0;
  const isAddressValid = isConsumidorFinal || customerAddress.trim().length > 0;
  const isEmailValid = isConsumidorFinal || isValidEmail(customerEmail);

  const isCustomerDataValid = isNameValid && isDocValid && isPhoneValid && isAddressValid && isEmailValid;

  const lookupCedula = async (cedula: string) => {
    const cleanCedula = cedula.trim();
    if (!cleanCedula || cleanCedula === '9999999999') return;

    // 1. Search in local synchronized customers database first
    const existingDbCustomer = customers?.find(c => c.documentId.trim() === cleanCedula);
    if (existingDbCustomer) {
      setCustomerName(existingDbCustomer.name);
      setCustomerPhone(existingDbCustomer.phone || '');
      setCustomerAddress(existingDbCustomer.address || '');
      setCustomerEmail(existingDbCustomer.email || '');
      setIsLoadedFromDb(true);
      setSearchCedulaError(null);
      return;
    }

    // 2. Search in sales history as fallback
    const existingSaleCustomer = sales?.find(s => s.customer?.documentId.trim() === cleanCedula)?.customer;
    if (existingSaleCustomer) {
      setCustomerName(existingSaleCustomer.name);
      setCustomerPhone(existingSaleCustomer.phone || '');
      setCustomerAddress(existingSaleCustomer.address || '');
      setCustomerEmail(existingSaleCustomer.email || '');
      setIsLoadedFromDb(true);
      setSearchCedulaError(null);
      return;
    }

    setIsLoadedFromDb(false);
    setIsSearchingCedula(true);
    setSearchCedulaError(null);
    try {
      const res = await consultarIdentificacionSri(cleanCedula);
      if (res.success && res.nombre) {
        setCustomerName(res.nombre);
        setSearchCedulaError(null);
      } else {
        setSearchCedulaError(res.error || 'No se encontraron datos registrados en el SRI/Registro Civil');
      }
    } catch (err: any) {
      console.error('Error in lookupCedula:', err);
      setSearchCedulaError(err.message || 'Error al consultar identificación en el SRI');
    } finally {
      setIsSearchingCedula(false);
    }
  };

  useEffect(() => {
    const cleanId = customerDocumentId.trim();
    if (cleanId && cleanId !== '9999999999' && (cleanId.length === 10 || cleanId.length === 13)) {
      const delayDebounce = setTimeout(() => {
        lookupCedula(cleanId);
      }, 600);
      return () => clearTimeout(delayDebounce);
    }
  }, [customerDocumentId]);

  const setConsumidorFinal = () => {
    setCustomerName('CONSUMIDOR FINAL');
    setCustomerDocumentId('9999999999');
    setCustomerPhone('');
    setCustomerAddress('S/N');
    setCustomerEmail('');
    setIsLoadedFromDb(false);
  };

  const clearCustomerDetails = () => {
    setCustomerName('');
    setCustomerDocumentId('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerEmail('');
    setIsLoadedFromDb(false);
  };

  // Helper categories in Spanish
  const categories = [
    { id: 'todos', name: 'Todos' },
    { id: 'cafe_caliente', name: 'Café Caliente y Tradicional' },
    { id: 'tes_infusiones', name: 'Tés e Infusiones' },
    { id: 'bebidas_frias_frappes', name: 'Bebidas Frías y Frappés' },
    { id: 'zumos_jugos', name: 'Zumos y Jugos Naturales' },
    { id: 'bebidas_envasadas', name: 'Bebidas envasadas' },
    { id: 'bebidas_alcoholicas', name: 'Bebidas alcohólicas' },
    { id: 'reposteria', name: 'Repostería' },
    { id: 'alimentos', name: 'Alimentos' },
    { id: 'combos', name: 'Combos' },
  ];

  // Search and filter menu items
  const filteredItems = menuItems.filter((item) => {
    if (item.status !== 'active') return false;
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'todos' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Calculate ingredient availability for a given menu item
  const calculateMaxStockAvailable = (menuItem: MenuItem): number => {
    if (menuItem.category === 'combos') {
      if (!menuItem.ingredients || menuItem.ingredients.length === 0) {
        return menuItem.stock !== undefined ? menuItem.stock : 99;
      }
      let minQuantity = 99;
      let foundAnyComponent = false;
      menuItem.ingredients.forEach((req) => {
        const component = menuItems.find((m) => m.id === req.ingredientId);
        // If component was deleted, skip it - don't let a ghost reference block the sale
        if (!component) return;
        foundAnyComponent = true;
        const componentAvailable = calculateMaxStockAvailable(component);
        const available = Math.floor(componentAvailable / req.quantity);
        if (available < minQuantity) {
          minQuantity = available;
        }
      });
      // If no valid components found (all deleted), treat as available
      return foundAnyComponent ? minQuantity : 99;
    }

    if (!menuItem.ingredients || menuItem.ingredients.length === 0) {
      return menuItem.stock !== undefined ? menuItem.stock : 99;
    }

    let minQuantity = 99;
    let foundAnyIngredient = false;

    menuItem.ingredients.forEach((req) => {
      const ingredient = ingredients.find((ing) => ing.id === req.ingredientId);
      // If ingredient was deleted, skip it - don't block the sale on ghost references
      if (!ingredient) return;
      foundAnyIngredient = true;

      // Compute recursive ingredient usage in cart
      let totalUsedInCart = 0;
      cart.forEach((cartItem) => {
        const getIngredientUsage = (mItem: MenuItem, qty: number): number => {
          if (!mItem.ingredients) return 0;
          if (mItem.category === 'combos') {
            let sum = 0;
            mItem.ingredients.forEach((cReq) => {
              const comp = menuItems.find(m => m.id === cReq.ingredientId);
              if (comp) {
                sum += getIngredientUsage(comp, cReq.quantity * qty);
              }
            });
            return sum;
          } else {
            const match = mItem.ingredients.find(r => r.ingredientId === req.ingredientId);
            return match ? match.quantity * qty : 0;
          }
        };
        totalUsedInCart += getIngredientUsage(cartItem.menuItem, cartItem.quantity);
      });

      const availableStockLeft = Math.max(0, ingredient.stock - totalUsedInCart);
      const possibleWithThis = Math.floor(availableStockLeft / req.quantity);

      if (possibleWithThis < minQuantity) {
        minQuantity = possibleWithThis;
      }
    });

    // If no valid ingredients found (all deleted), treat as freely available
    return foundAnyIngredient ? minQuantity : 99;
  };

  const hasIngredientShortage = (item: MenuItem): boolean => {
    if (item.category === 'combos') {
      if (!item.ingredients || item.ingredients.length === 0) {
        return item.stock !== undefined ? item.stock <= 0 : false;
      }
      // Only report shortage if the component EXISTS and actually has no stock
      // Deleted/ghost components are ignored
      return item.ingredients.some((req) => {
        const component = menuItems.find((m) => m.id === req.ingredientId);
        if (!component) return false; // deleted component = not a shortage
        return hasIngredientShortage(component);
      });
    }

    if (!item.ingredients || item.ingredients.length === 0) {
      return item.stock !== undefined ? item.stock <= 0 : false;
    }

    return item.ingredients.some((req) => {
      const ingredient = ingredients.find((ing) => ing.id === req.ingredientId);
      if (!ingredient) return false; // deleted ingredient = not a shortage
      return ingredient.stock <= 0 || ingredient.stock < req.quantity;
    });
  };

  const handleAddToCart = (item: MenuItem) => {
    const available = calculateMaxStockAvailable(item);
    if (available <= 0) return;

    const existingIndex = cart.findIndex((cartItem) => cartItem.menuItem.id === item.id);
    if (existingIndex > -1) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      setCart(newCart);
    } else {
      setCart([...cart, { menuItem: item, quantity: 1, discountPercent: 0 }]);
    }
  };

  const handleUpdateItemDiscount = (itemId: string, pct: number) => {
    const existingIndex = cart.findIndex((cartItem) => cartItem.menuItem.id === itemId);
    if (existingIndex === -1) return;
    const newCart = [...cart];
    newCart[existingIndex].discountPercent = Math.max(0, Math.min(100, pct));
    setCart(newCart);
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    const existingIndex = cart.findIndex((cartItem) => cartItem.menuItem.id === itemId);
    if (existingIndex === -1) return;

    const cartItem = cart[existingIndex];
    if (delta > 0) {
      const available = calculateMaxStockAvailable(cartItem.menuItem);
      if (available <= 0) return;
    }

    const newCart = [...cart];
    newCart[existingIndex].quantity += delta;

    if (newCart[existingIndex].quantity <= 0) {
      newCart.splice(existingIndex, 1);
    }
    setCart(newCart);
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart(cart.filter((item) => item.menuItem.id !== itemId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const getCartSubtotal = () => {
    return cart.reduce((total, item) => total + (item.menuItem.price * item.quantity), 0);
  };

  const getAppliedDiscount = () => {
    return cart.reduce((tot, item) => {
      const itemSubtotal = item.menuItem.price * item.quantity;
      const itemDiscPercent = item.discountPercent || 0;
      return tot + (itemSubtotal * itemDiscPercent) / 100;
    }, 0);
  };

  // Cálculo de IVA desglosado (incluido en el PVP, NO se aumenta al total)
  const subtotal = getCartSubtotal();
  const appliedDiscount = getAppliedDiscount();
  const finalTotal = Math.max(0, subtotal - appliedDiscount);
  const defaultIvaPct = company?.tarifaIvaPredeterminada !== undefined ? company.tarifaIvaPredeterminada : 15;
  const taxRate = applyHolidayIva8 ? 0.08 : (defaultIvaPct / 100);

  // Desglosar base imponible e IVA por cada ítem del carrito
  const { subtotalSinIva, taxAmount } = cart.reduce(
    (acc, cartItem) => {
      const itemGross = cartItem.menuItem.price * cartItem.quantity;
      const itemDisc = (itemGross * (cartItem.discountPercent || 0)) / 100;
      const itemTotalConIva = Math.max(0, itemGross - itemDisc);
      const itemIvaPct = applyHolidayIva8
        ? 8
        : (cartItem.menuItem.tarifaIva !== undefined ? cartItem.menuItem.tarifaIva : defaultIvaPct);
      const itemRate = itemIvaPct / 100;
      const itemBaseSinIva = itemRate > 0 ? itemTotalConIva / (1 + itemRate) : itemTotalConIva;
      const itemIva = itemTotalConIva - itemBaseSinIva;
      return {
        subtotalSinIva: acc.subtotalSinIva + itemBaseSinIva,
        taxAmount: acc.taxAmount + itemIva,
      };
    },
    { subtotalSinIva: 0, taxAmount: 0 }
  );
  const taxableBase = subtotalSinIva;
  const total = subtotal;

  const getCartStockStatus = () => {
    let hasAgotados = false;
    let hasStockBajo = false;
    const agotadosList: string[] = [];
    const lowStockList: string[] = [];

    cart.forEach((cartItem) => {
      const item = cartItem.menuItem;
      const maxAvail = calculateMaxStockAvailable(item);
      if (maxAvail <= 0) {
        hasAgotados = true;
        if (!agotadosList.includes(item.name)) agotadosList.push(item.name);
      }

      if (item.ingredients) {
        item.ingredients.forEach((req) => {
          const ing = ingredients.find((i) => i.id === req.ingredientId);
          if (ing) {
            if (ing.stock <= 0) {
              hasAgotados = true;
              if (!agotadosList.includes(ing.name)) agotadosList.push(ing.name);
            } else if (ing.stock <= 10) {
              hasStockBajo = true;
              const label = `${ing.name} (${ing.stock} ${ing.unit})`;
              if (!lowStockList.includes(label)) lowStockList.push(label);
            }
          }
        });
      }
    });

    return { hasAgotados, hasStockBajo, agotadosList, lowStockList };
  };

  const getNextComprobanteNumber = (type: 'nota_venta' | 'factura') => {
    if (type === 'factura') {
      const estab = company?.codigoEstablecimiento || '001';
      const pto = company?.puntoEmision || '001';
      let secNum = company?.secuencialFactura;
      if (!secNum) {
        let maxFact = 0;
        sales.filter(s => s.documentType === 'factura').forEach(s => {
          if (s.invoiceNumber) {
            const digits = s.invoiceNumber.replace(/\D/g, '');
            const num = parseInt(digits, 10);
            if (!isNaN(num) && num > maxFact) maxFact = num;
          }
        });
        secNum = maxFact + 1;
      }
      return `${estab}-${pto}-${String(secNum).padStart(9, '0')}`;
    } else {
      let secNum = company?.secuencialNotaVenta;
      if (!secNum) {
        let maxNota = 0;
        sales.filter(s => s.documentType !== 'factura').forEach(s => {
          if (s.invoiceNumber) {
            const digits = s.invoiceNumber.replace(/\D/g, '');
            const num = parseInt(digits, 10);
            if (!isNaN(num) && num > maxNota) maxNota = num;
          }
        });
        secNum = maxNota + 1;
      }
      return `#${String(secNum).padStart(6, '0')}`;
    }
  };

  const handleCheckoutClick = () => {
    setPaymentMethod('efectivo');
    setCashReceived('');
    setTransferNumber('');
    setShowCheckoutModal(true);
  };

  const handleProcessPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    if (documentType === 'factura' && finalTotal > 50 && isConsumidorFinal) {
      alert('Según la normativa del SRI del Ecuador, las facturas por montos superiores a $50.00 NO pueden emitirse a Consumidor Final. Debe registrar obligatoriamente los datos del cliente (Cédula o RUC, Nombre, etc.).');
      return;
    }

    if (!isConsumidorFinal && !isCustomerDataValid) {
      alert(`Para emitir ${documentType === 'factura' ? 'la factura' : 'la nota de venta'} con datos del cliente, debe completar obligatoriamente todos los campos: Nombre, Cédula/RUC/Pasaporte válido, Teléfono, Dirección y Correo electrónico.`);
      return;
    }

    const stockStatus = getCartStockStatus();
    if (stockStatus.hasAgotados) {
      alert(`No se puede cobrar la orden porque hay insumos agotados (Stock 0): ${stockStatus.agotadosList.join(', ')}.`);
      return;
    }

    const saleItems: SaleItem[] = cart.map((cartItem) => ({
      menuItemId: cartItem.menuItem.id,
      name: cartItem.menuItem.name,
      quantity: cartItem.quantity,
      price: cartItem.menuItem.price,
      cost: cartItem.menuItem.cost,
      discountPercent: cartItem.discountPercent || 0,
      tarifaIva: applyHolidayIva8
        ? 8
        : (cartItem.menuItem.tarifaIva !== undefined ? cartItem.menuItem.tarifaIva : defaultIvaPct),
    }));

    const appliedDiscount = getAppliedDiscount();

    const rcv = paymentMethod === 'efectivo' ? (parseNum(cashReceived) || 0) : undefined;
    const chg = paymentMethod === 'efectivo' ? getCashChange() : undefined;
    const tfNum = paymentMethod === 'transferencia' ? transferNumber : undefined;

    // Calculate sequential ticket invoice number
    const nextInvoiceNumber = getNextComprobanteNumber(documentType);

    let accessKeyVal: string | undefined = undefined;
    if (documentType === 'factura') {
      const fechaEmision = new Date().toISOString().split('T')[0];
      const secNum = company?.secuencialFactura || 1;
      const secStr = String(secNum).padStart(9, '0');
      const estab = company?.codigoEstablecimiento || '001';
      const pto = company?.puntoEmision || '001';
      accessKeyVal = generateAccessKey({
        fechaEmision,
        tipoComprobante: '01',
        rucEmisor: company?.ruc || '1725403883001',
        ambiente: company?.ambiente || '1',
        establecimiento: estab,
        puntoEmision: pto,
        secuencial: secStr,
        tipoEmision: company?.tipoEmision || '1',
      });
    }

    const custDetails: CustomerDetails = {
      name: customerName.trim() || 'CONSUMIDOR FINAL',
      documentId: customerDocumentId.trim() || '9999999999',
      phone: customerPhone.trim(),
      address: customerAddress.trim() || 'S/N',
      email: customerEmail.trim()
    };

    const mockTicket: Sale = {
      id: `sale_temp_${Date.now()}`,
      invoiceNumber: nextInvoiceNumber,
      timestamp: new Date().toISOString(),
      items: saleItems,
      total: finalTotal,
      cost: saleItems.reduce((acc, cur) => acc + (cur.cost * cur.quantity), 0),
      paymentMethod: paymentMethod,
      status: 'completed',
      employeeId: activeEmployee?.id || '',
      employeeName: activeEmployee?.name || 'Sistema',
      cashReceived: rcv,
      changeGiven: chg,
      transferNumber: tfNum,
      customer: custDetails,
      discount: appliedDiscount,
      subtotal: subtotalSinIva,
      taxRate: taxRate,
      tax: taxAmount,
      documentType: documentType,
      accessKey: accessKeyVal
    };

    if (documentType === 'factura') {
      // Ocultar modal de cobro y activar ciclo SRI
      setShowCheckoutModal(false);
      setSriCycle({
        active: true,
        step: 'signing',
        invoiceNumber: nextInvoiceNumber,
        accessKey: accessKeyVal,
        clientName: custDetails.name,
        total: finalTotal,
      });

      // Ciclo: 1. Firmando -> 2. Recepción SRI
      setTimeout(() => {
        setSriCycle((prev) => prev ? { ...prev, step: 'reception' } : null);
      }, 900);

      // Ciclo: 2. Recepción -> 3. Autorización SRI
      setTimeout(() => {
        setSriCycle((prev) => prev ? { ...prev, step: 'authorization' } : null);
      }, 1800);

      // Ciclo: 3. Autorizado por el SRI
      setTimeout(() => {
        setSriCycle((prev) => prev ? { ...prev, step: 'done' } : null);
      }, 2700);

      // Finalizar: registrar venta y mostrar modal Vista Previa RIDE
      setTimeout(() => {
        onRegisterSale(
          saleItems,
          paymentMethod,
          rcv,
          chg,
          tfNum,
          custDetails,
          nextInvoiceNumber,
          appliedDiscount,
          taxRate,
          documentType,
          accessKeyVal
        );

        setPreviewRideSale(mockTicket);
        setCart([]);
        setSriCycle(null);

        // Envío automático por SMTP de RIDE + XML Autorizado si el cliente tiene correo
        if (company && (company.smtpAutoSend ?? true) && isSmtpConfigured(company) && custDetails.email && custDetails.email.includes('@')) {
          sendSaleComprobanteEmail(mockTicket, company, custDetails.email).then((res) => {
            if (res.success) {
              showRetroToast(`📧 Factura RIDE + XML enviada a ${custDetails.email}`);
            }
          });
        }
      }, 3400);

      return;
    }

    // Nota de venta (régimen regular / RIMPE, emisión directa sin WS de facturación electrónica)
    onRegisterSale(
      saleItems,
      paymentMethod,
      rcv,
      chg,
      tfNum,
      custDetails,
      nextInvoiceNumber,
      appliedDiscount,
      taxRate,
      documentType,
      accessKeyVal
    );
    setRecentSaleTicket(mockTicket);
    setCart([]);
    setShowCheckoutModal(false);

    // Envío automático por SMTP de la Nota de Venta si el cliente tiene correo
    if (company && (company.smtpAutoSend ?? true) && isSmtpConfigured(company) && custDetails.email && custDetails.email.includes('@')) {
      sendSaleComprobanteEmail(mockTicket, company, custDetails.email).then((res) => {
        if (res.success) {
          showRetroToast(`📧 Nota de Venta enviada a ${custDetails.email}`);
        }
      });
    }
  };

  const getCashChange = () => {
    const received = parseNum(cashReceived) || 0;
    if (received < finalTotal) return 0;
    return received - finalTotal;
  };

  const getLocalDateString = (isoString?: string) => {
    const d = isoString ? new Date(isoString) : new Date();
    return d.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };
  const todayStr = getLocalDateString();
  const hasShiftStartedToday = shiftsHistory && activeEmployee && shiftsHistory.some(s => s.employeeId === activeEmployee.id && getLocalDateString(s.startTime) === todayStr);

  if (!activeShift) {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white border-4 border-black rounded-xl p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center space-y-6 font-bold" id="pos-locked-view">
        {hasShiftStartedToday ? (
          <>
            <div className="w-20 h-20 bg-red-100 border-4 border-black text-red-600 rounded-full flex items-center justify-center mx-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <span className="text-4xl">🔒</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-retro-heavy text-black uppercase tracking-wide">
              Turno Diario Finalizado
            </h2>
            <div className="bg-pink-50 border-3 border-black p-5 rounded-lg text-left text-sm space-y-3.5 leading-relaxed text-black font-sans">
              <p className="font-black text-red-800 uppercase tracking-wide">
                🚫 REGISTRO BLOQUEADO DEFINITIVAMENTE HOY
              </p>
              <p>
                El turno de caja correspondiente al día de hoy (<strong className="underline decoration-pink-500 font-retro-mono">{todayStr}</strong>) ya ha sido cerrado por un operador.
              </p>
              <p>
                Por razones de control fiscal, auditoría y seguridad contra robos o descuadres de dinero, <strong>solo se permite registrar un único turno diario</strong>. No es posible abrir un nuevo turno ni procesar pagos hasta el día de mañana.
              </p>
            </div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest animate-pulse font-retro-mono">
              La caja se reactivará automáticamente el próximo día calendario
            </p>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-yellow-200 border-4 border-black text-black rounded-full flex items-center justify-center mx-auto shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <span className="text-4xl">🔑</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-retro-heavy text-black uppercase tracking-wide">
              Apertura de Caja Requerida
            </h2>
            <div className="bg-cyan-50 border-3 border-black p-5 rounded-lg text-left text-sm space-y-3.5 leading-relaxed text-black font-sans">
              <p className="font-black text-cyan-800 uppercase tracking-wide">
                ⚠️ SE REQUIERE TURNO ACTIVO PARA OPERAR
              </p>
              <p>
                Para poder procesar ventas, restar del inventario físico y asegurar un arqueo preciso al cierre de operaciones, <strong>debes abrir un turno de trabajo obligatorio</strong>.
              </p>
              <p>
                Para comenzar, haz clic en el botón <strong className="bg-fuchsia-200 border border-black px-1.5 py-0.5 rounded uppercase font-retro-mono text-xs">Abrir Turno</strong> ubicado en la barra superior del sistema e ingresa tu fondo inicial de caja.
              </p>
            </div>
            <div className="bg-yellow-100 border-2 border-black p-3.5 rounded-lg text-xs flex items-center gap-2.5 text-zinc-700 font-sans">
              <AlertTriangle className="w-5 h-5 text-black flex-shrink-0 stroke-[2.5]" />
              <span className="font-extrabold uppercase">TODAS LAS VENTAS DEBEN SER REGISTRADAS BAJO UN TURNO DE CAJA ACTIVO.</span>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 xl:gap-6" id="pos-container">
      {/* Products list area */}
      <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4 sm:gap-5">

        {/* Global Stock Status Banners */}
        {(() => {
          const lowIngs = ingredients.filter((i) => i.stock > 0 && i.stock <= 10);
          const outIngs = ingredients.filter((i) => i.stock <= 0);

          if (lowIngs.length === 0 && outIngs.length === 0) return null;

          return (
            <div className="space-y-2.5">
              {lowIngs.length > 0 && (
                <div className="bg-amber-100 border-2 sm:border-3 border-amber-500 text-amber-950 p-3 rounded-xl text-xs font-bold flex items-start gap-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <span className="text-lg leading-none">⚠️</span>
                  <div className="text-left">
                    <p className="font-black text-amber-900 uppercase text-[10.5px] tracking-wide">AVISO: INSUMOS CON STOCK BAJO (≤ 10 UNIDADES)</p>
                    <p className="text-[10px] text-amber-900 font-semibold mt-0.5">
                      Insumos con 10 o menos unidades: {' '}
                      <strong>{lowIngs.map((i) => `${i.name} (${i.stock} ${i.unit})`).join(', ')}</strong>.
                      <span className="text-emerald-800 font-black ml-1">Se puede continuar vendiendo normalmente.</span>
                    </p>
                  </div>
                </div>
              )}

              {outIngs.length > 0 && (
                <div className="bg-rose-100 border-2 sm:border-3 border-rose-500 text-rose-950 p-3 rounded-xl text-xs font-bold flex items-start gap-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <span className="text-lg leading-none">🚫</span>
                  <div className="text-left">
                    <p className="font-black text-rose-950 uppercase text-[10.5px] tracking-wide">INSUMOS AGOTADOS (STOCK 0)</p>
                    <p className="text-[10px] text-rose-900 font-semibold mt-0.5">
                      Insumos en cero: <strong>{outIngs.map((i) => i.name).join(', ')}</strong>.
                      <span className="text-rose-950 font-black ml-1">Los productos que dependen de estos insumos no se pueden vender hasta reabastecer.</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Search and Filters */}
        <div className="bg-white border-3 sm:border-4 border-black rounded-xl p-3 sm:p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 sm:top-3.5 w-4 sm:w-5 h-4 sm:h-5 text-black stroke-[2.5]" />
            <input
              type="text"
              placeholder="Escribe para buscar capuchinos, lattes, donas, postres..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border-2 sm:border-3 border-black rounded-lg text-xs sm:text-sm font-extrabold focus:outline-none focus:bg-cyan-50 bg-pink-50 font-retro-mono text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            />
          </div>

          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none py-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 border-2 border-black rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 ${selectedCategory === cat.id
                    ? 'bg-fuchsia-400 text-black shadow-[2px_2px_0px_0px_#000] translate-x-[-1px] translate-y-[-1px]'
                    : 'bg-white text-black hover:bg-yellow-100 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5'
                  }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4" id="products-grid">
          {filteredItems.map((item) => {
            const maxAvailable = calculateMaxStockAvailable(item);
            const isOutOfStock = maxAvailable <= 0;

            // Neon color styles based on category
            const categoryMeta =
              (item.category === 'cafes' || item.category === 'cafe_caliente') ? { bg: 'bg-lime-200', text: 'Café Caliente' } :
                item.category === 'tes_infusiones' ? { bg: 'bg-emerald-200', text: 'Té/Infusión' } :
                  (item.category === 'bebidas_frias' || item.category === 'bebidas_frias_frappes') ? { bg: 'bg-cyan-200', text: 'Frío/Frappé' } :
                    item.category === 'zumos_jugos' ? { bg: 'bg-orange-200', text: 'Jugo Natural' } :
                      item.category === 'bebidas_envasadas' ? { bg: 'bg-sky-200', text: 'Envasado' } :
                        item.category === 'bebidas_alcoholicas' ? { bg: 'bg-rose-200', text: 'Bebida Alc.' } :
                          item.category === 'reposteria' ? { bg: 'bg-pink-200', text: 'Pastel' } :
                            item.category === 'combos' ? { bg: 'bg-orange-300', text: 'Combo' } :
                              { bg: 'bg-yellow-200', text: 'Alimento' };

            return (
              <button
                key={item.id}
                disabled={isOutOfStock}
                onClick={() => handleAddToCart(item)}
                className={`relative bg-white border-2 sm:border-3 border-black rounded-lg sm:rounded-xl p-3 flex flex-col justify-between text-left transition-all duration-150 shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] sm:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] min-h-[145px] sm:min-h-[160px] h-full ${isOutOfStock
                    ? 'opacity-40 cursor-not-allowed bg-zinc-200'
                    : 'hover:bg-yellow-50 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] cursor-pointer group'
                  }`}
              >
                <div className="w-full">
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className={`inline-block px-1.5 py-0.5 rounded border border-black text-[8.5px] font-black tracking-wider uppercase ${categoryMeta.bg} text-black`}>
                      {categoryMeta.text}
                    </span>
                    {!(item.category === 'reposteria' || item.category === 'alimentos' || item.category === 'combos') && (
                      <span className="text-[9.5px] font-retro-mono bg-black text-lime-400 px-1.5 py-0.2 rounded font-bold">
                        x{maxAvailable}
                      </span>
                    )}
                  </div>

                  <h4 className="font-retro-heavy text-xs sm:text-sm text-black group-hover:text-purple-900 transition-colors break-words whitespace-normal leading-snug">
                    {item.name}
                  </h4>
                  {item.description && (
                    <p className="text-[10px] text-zinc-600 line-clamp-1 mt-0.5 leading-snug font-bold font-sans">
                      {item.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between w-full mt-2 pt-2 border-t border-dashed border-black/30">
                  <span className="font-retro-mono font-black text-black text-xs sm:text-sm bg-yellow-300 px-1.5 py-0.5 border border-black rounded shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                    ${formatNum(item.price)}
                  </span>

                  {isOutOfStock ? (
                    <span className="text-[9px] font-black uppercase text-white bg-red-500 border border-black rounded px-1.5 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                      Agotado
                    </span>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-wider text-black bg-cyan-300 border border-black px-1.5 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] group-hover:bg-cyan-400 flex items-center gap-0.5">
                      <Plus className="w-3 h-3 stroke-[3]" />
                      SUMAR
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="col-span-full bg-white border-4 border-dashed border-black rounded-xl p-8 text-center" id="no-products-found">
              <Receipt className="w-10 h-10 text-black mx-auto mb-2 stroke-[1.5] animate-bounce" />
              <p className="font-retro-heavy text-sm text-black uppercase">SIN COINCIDENCIAS</p>
              <p className="text-xs text-zinc-600 font-bold max-w-sm mx-auto mt-1 leading-relaxed">
                No se encontraron artículos con ese filtro. Revisa el buscador o agrega especialidades en Inventario.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cart & Billing details */}
      <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
        <div className="bg-white border-3 sm:border-4 border-black rounded-xl shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between overflow-hidden lg:sticky lg:top-[125px] h-[calc(100dvh-140px)] min-h-[460px]" id="pos-cart-panel">
          {/* Cart Header */}
          <div className="border-b-3 sm:border-b-4 border-black px-4 py-2.5 sm:py-3 bg-pink-300 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-black">
              <ShoppingCart className="w-4 sm:w-5 h-4 sm:h-5 stroke-[2.5]" />
              <span className="font-retro-heavy text-xs sm:text-sm uppercase">ORDEN DE COBRO</span>
              <span className="bg-black text-lime-400 border border-black rounded text-[9.5px] font-retro-mono font-bold px-1.5 py-0.2 shadow-[1px_1px_0px_0px_rgba(255,255,255,1)]">
                {cart.reduce((sum, i) => sum + i.quantity, 0)} ITEMS
              </span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="bg-red-400 hover:bg-red-500 border border-black text-black px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5"
              >
                LIMPIAR
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2.5 sm:px-3 py-2 bg-pink-50/20 space-y-2">
            {cart.map((cartItem) => (
              <div key={cartItem.menuItem.id} className="p-2.5 bg-white border-2 border-black rounded-lg sm:rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-1.5 text-black">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide break-words leading-tight">{cartItem.menuItem.name}</p>
                    <p className="text-[10px] text-zinc-600 font-retro-mono mt-0.5 font-bold">
                      ${formatNum(cartItem.menuItem.price)} c/u
                      {cartItem.discountPercent ? cartItem.discountPercent > 0 && (
                        <span className="ml-1 bg-rose-500 text-white px-1 py-0.2 rounded text-[8.5px] font-black uppercase">
                          -{cartItem.discountPercent}%
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="text-right flex flex-col items-end shrink-0">
                    <p className="text-[11px] font-retro-mono font-black bg-black text-yellow-300 px-1.5 py-0.2 rounded shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                      {cartItem.discountPercent && cartItem.discountPercent > 0 ? (
                        <span>
                          <span className="line-through text-zinc-400 text-[9px] mr-1">
                            ${formatNum(cartItem.menuItem.price * cartItem.quantity)}
                          </span>
                          ${formatNum((cartItem.menuItem.price * cartItem.quantity) * (1 - cartItem.discountPercent / 100))}
                        </span>
                      ) : (
                        `$${formatNum(cartItem.menuItem.price * cartItem.quantity)}`
                      )}
                    </p>
                    <button
                      onClick={() => handleRemoveFromCart(cartItem.menuItem.id)}
                      className="text-[8.5px] text-red-600 hover:text-red-800 font-black uppercase tracking-wider mt-0.5 cursor-pointer block"
                    >
                      QUITAR
                    </button>
                  </div>
                </div>

                {/* Adjust quantities & discount */}
                <div className="flex items-center justify-between pt-1 border-t border-dashed border-zinc-200 gap-2">
                  <div className="flex items-center gap-1 bg-yellow-100 border border-black rounded-lg p-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                    <button
                      onClick={() => handleUpdateQuantity(cartItem.menuItem.id, -1)}
                      className="p-1 hover:bg-red-200 rounded text-black font-black cursor-pointer transition-colors"
                    >
                      <Minus className="w-3 h-3 stroke-[3]" />
                    </button>
                    <span className="font-retro-mono text-[11px] font-black w-5 text-center">
                      {cartItem.quantity}
                    </span>
                    <button
                      onClick={() => handleUpdateQuantity(cartItem.menuItem.id, 1)}
                      className="p-1 hover:bg-lime-200 rounded text-black font-black cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3 stroke-[3]" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 bg-zinc-50 border border-black border-dashed px-1.5 py-0.5 rounded text-[9.5px]">
                    <span className="text-zinc-600 font-black uppercase text-[8.5px]">Desc:</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      placeholder="0%"
                      value={cartItem.discountPercent || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const parsed = parseNum(val) || 0;
                        if (val === '' || (parsed >= 0 && parsed <= 100)) {
                          handleUpdateItemDiscount(cartItem.menuItem.id, val === '' ? 0 : parsed);
                        }
                      }}
                      className="w-8 text-right bg-yellow-50 px-0.5 py-0.2 border border-black rounded text-[10px] font-retro-mono font-bold text-black focus:outline-none focus:bg-pink-100"
                    />
                    <span className="font-black">%</span>
                  </div>
                </div>
              </div>
            ))}

            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center text-zinc-500 font-bold">
                <ShoppingCart className="w-10 h-10 stroke-[1.5] text-black mb-2 animate-pulse" />
                <p className="font-retro-heavy text-xs sm:text-sm uppercase text-black">CARRITO VACÍO</p>
                <p className="text-[11px] sm:text-xs text-zinc-600 px-4 mt-1 leading-snug font-sans font-semibold">
                  Haz click en las tarjetas de productos para cargar el ticket de compra.
                </p>
              </div>
            )}
          </div>

          {/* Checkout Totals & Submit */}
          <div className="border-t-3 sm:border-t-4 border-black p-3 sm:p-3.5 bg-cyan-200 space-y-2 sm:space-y-2.5 shrink-0">
            {/* Selector Comprobante: Nota de Venta vs Factura */}
            <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl border-2 sm:border-3 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-retro-heavy text-[11px] sm:text-xs uppercase tracking-wide text-black flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-fuchsia-600 stroke-[2.5]" />
                  <span>ENTREGAR AL CLIENTE:</span>
                </span>
                <span className={`text-[8.5px] sm:text-[9px] font-black uppercase px-1.5 py-0.5 rounded border-2 border-black font-retro-mono shadow-[1px_1px_0px_0px_#000] ${
                  documentType === 'factura' ? 'bg-cyan-300 text-cyan-950' : 'bg-yellow-300 text-yellow-950'
                }`}>
                  {documentType === 'factura' ? '🧾 FACTURA SRI' : '📄 NOTA VENTA'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDocumentType('nota_venta')}
                  className={`py-1.5 px-2 rounded-lg border-2 border-black font-black text-[11px] uppercase transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    documentType === 'nota_venta'
                      ? 'bg-yellow-300 text-black shadow-[2px_2px_0px_0px_#000] translate-x-[-1px] translate-y-[-1px] ring-2 ring-black'
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
                  }`}
                >
                  <span>📄 Nota Venta</span>
                  {documentType === 'nota_venta' && <span className="text-[10px] text-black">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setDocumentType('factura')}
                  className={`py-1.5 px-2 rounded-lg border-2 border-black font-black text-[11px] uppercase transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    documentType === 'factura'
                      ? 'bg-cyan-300 text-black shadow-[2px_2px_0px_0px_#000] translate-x-[-1px] translate-y-[-1px] ring-2 ring-black'
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
                  }`}
                >
                  <span>🧾 Factura SRI</span>
                  {documentType === 'factura' && <span className="text-[10px] text-black">✓</span>}
                </button>
              </div>
            </div>

            {/* Casilla 8% IVA Feriados Ecuador */}
            <div className={`p-1.5 sm:p-2 rounded-lg border-2 border-black transition-all shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] ${applyHolidayIva8 ? 'bg-amber-300' : 'bg-white'
              }`}>
              <label className="flex items-center justify-between cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="checkbox-iva-8-feriados"
                    checked={applyHolidayIva8}
                    onChange={(e) => handleToggleHolidayIva8(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-black cursor-pointer border-2 border-black"
                  />
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="font-retro-heavy text-[10.5px] uppercase tracking-wide text-black">IVA Feriados (8%)</span>
                      <span className="bg-black text-amber-300 text-[8px] font-black px-1 py-0.2 rounded uppercase">
                        EC
                      </span>
                    </div>
                  </div>
                </div>
                {applyHolidayIva8 ? (
                  <span className="font-retro-mono text-[11px] font-black bg-black text-lime-400 px-1.5 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                    ${formatNum(taxAmount)} (Desg.)
                  </span>
                ) : (
                  <span className="text-[9px] font-bold text-zinc-500 uppercase bg-zinc-100 border border-zinc-300 px-1 py-0.2 rounded">
                    15% Normal
                  </span>
                )}
              </label>
            </div>

            <div className="space-y-1 text-[11px] text-black font-bold">
              <div className="flex justify-between">
                <span>Subtotal (Sin IVA):</span>
                <span className="font-retro-mono text-xs">${formatNum(subtotalSinIva)}</span>
              </div>
              {appliedDiscount > 0 && (
                <div className="flex justify-between text-rose-600 font-extrabold">
                  <span>Descuento productos:</span>
                  <span className="font-retro-mono text-xs">-${formatNum(appliedDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>{applyHolidayIva8 ? 'IVA Feriado (8% Desg.):' : `IVA (${defaultIvaPct}% Desg.):`}</span>
                <span className={`font-retro-mono text-xs ${taxAmount > 0 ? 'text-amber-950 font-black' : ''}`}>
                  ${formatNum(taxAmount)}
                </span>
              </div>
              <div className="flex justify-between border-t-2 border-black pt-1.5 text-black font-black text-xs sm:text-sm">
                <span className="font-retro-heavy uppercase text-[10px] sm:text-xs">TOTAL A COBRAR (PVP):</span>
                <span className="font-retro-mono text-base sm:text-lg bg-yellow-300 border-2 border-black px-2 py-0.5 rounded shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                  ${formatNum(finalTotal)} USD
                </span>
              </div>
            </div>

            <button
              disabled={cart.length === 0}
              onClick={handleCheckoutClick}
              className={`w-full py-2.5 sm:py-3 rounded-lg text-xs font-black border-3 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all text-center uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer ${cart.length === 0
                  ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed border-zinc-400 shadow-none'
                  : 'bg-lime-300 hover:bg-lime-400 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px]'
                }`}
            >
              <Receipt className="w-4 h-4 stroke-[2.5]" />
              <span>PROCESAR PAGO (${formatNum(finalTotal)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Checkout Payment Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border-4 border-black max-w-lg w-full overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl">
            <form onSubmit={handleProcessPayment} className="max-h-[90vh] flex flex-col">
              <div className="bg-yellow-300 border-b-4 border-black p-5 text-black shrink-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-retro-heavy text-base uppercase">💳 EFECTUAR PAGO</h3>
                  {applyHolidayIva8 && (
                    <span className="bg-black text-amber-300 border border-black px-2 py-0.5 rounded text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,1)]">
                      🎉 IVA 8% Feriados
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold uppercase mt-1">
                  Transacción total:{' '}
                  {appliedDiscount > 0 ? (
                    <span>
                      <span className="line-through text-zinc-700 mr-2">${formatNum(subtotal)}</span>
                      <strong className="bg-black text-lime-400 px-1.5 py-0.5 rounded font-retro-mono font-bold">
                        ${formatNum(finalTotal)} USD
                      </strong>
                    </span>
                  ) : (
                    <strong className="bg-black text-lime-400 px-1.5 py-0.5 rounded font-retro-mono font-bold">
                      ${formatNum(finalTotal)} USD
                    </strong>
                  )}
                  <span className="ml-2 text-zinc-800 text-[10px] font-extrabold normal-case">
                    (Incluye IVA {applyHolidayIva8 ? '8%' : `${defaultIvaPct}%`} desglosado: ${formatNum(taxAmount)})
                  </span>
                </p>
              </div>

              <div className="p-5 space-y-4 bg-pink-50 overflow-y-auto max-h-[60vh]">
                {/* SELECTOR TIPO DE COMPROBANTE EN MODAL */}
                <div className={`rounded-xl p-4 border-3 border-black space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-black font-bold transition-all ${
                  documentType === 'factura' ? 'bg-cyan-50/90 border-cyan-950' : 'bg-amber-50/90 border-amber-950'
                }`}>
                  <div className="flex items-center justify-between border-b-2 border-black/20 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                      <span className="text-base">📑</span> ¿QUÉ DESEAS ENTREGAR AL CLIENTE?
                    </span>
                    <span className={`font-retro-mono text-xs font-black px-2.5 py-0.5 rounded border-2 border-black shadow-[1.5px_1.5px_0px_0px_#000] ${
                      documentType === 'factura' ? 'bg-cyan-300 text-cyan-950' : 'bg-yellow-300 text-yellow-950'
                    }`}>
                      {getNextComprobanteNumber(documentType)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setDocumentType('nota_venta')}
                      className={`py-2.5 px-3 rounded-xl border-3 border-black font-black text-xs uppercase flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                        documentType === 'nota_venta'
                          ? 'bg-yellow-300 shadow-[3px_3px_0px_0px_#000] scale-[1.02] text-black ring-2 ring-black'
                          : 'bg-white hover:bg-zinc-100 text-zinc-500'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">📄</span>
                        <span className="text-xs font-black">NOTA DE VENTA</span>
                        {documentType === 'nota_venta' && <span className="bg-black text-yellow-300 text-[9px] px-1.5 py-0.2 rounded font-mono">LISTO</span>}
                      </div>
                      <span className="text-[9.5px] font-bold text-zinc-600 normal-case">Sin desglose fiscal / Rápido</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocumentType('factura')}
                      className={`py-2.5 px-3 rounded-xl border-3 border-black font-black text-xs uppercase flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                        documentType === 'factura'
                          ? 'bg-cyan-300 shadow-[3px_3px_0px_0px_#000] scale-[1.02] text-black ring-2 ring-black'
                          : 'bg-white hover:bg-zinc-100 text-zinc-500'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">🧾</span>
                        <span className="text-xs font-black">FACTURA ELECTRÓNICA</span>
                        {documentType === 'factura' && <span className="bg-black text-cyan-300 text-[9px] px-1.5 py-0.2 rounded font-mono">LISTO</span>}
                      </div>
                      <span className="text-[9.5px] font-bold text-zinc-600 normal-case">Oficial SRI / Con desglose</span>
                    </button>
                  </div>
                  {documentType === 'factura' ? (
                    <div className="text-[10.5px] text-cyan-950 bg-cyan-100/80 border-2 border-cyan-400 p-2.5 rounded-lg font-bold space-y-1">
                      <p>ℹ️ Se emitirá una <strong>Factura oficial SRI</strong> con desglose fiscal y clave de acceso.</p>
                      {finalTotal > 50 && isConsumidorFinal && (
                        <p className="text-rose-600 font-black">
                          ⚠️ Supera $50.00: El SRI exige Cédula/RUC y datos del cliente (no Consumidor Final).
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10.5px] text-amber-950 bg-amber-100/80 border-2 border-amber-400 p-2.5 rounded-lg font-bold">
                      ℹ️ Se emitirá una <strong>Nota de Venta</strong> para consumo directo o régimen RIMPE Negocio Popular.
                    </div>
                  )}
                </div>

                {/* DATOS DEL CLIENTE */}
                <div className="bg-white rounded-lg p-4 border-3 border-black space-y-3.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-black font-bold">
                  <div className="flex items-center justify-between border-b-2 border-dashed border-zinc-200 pb-2 mb-1">
                    <span className="text-xs font-black uppercase tracking-wider text-fuchsia-600">👤 DATOS DEL CLIENTE</span>
                    <div className="flex gap-1.5">
                      {!isConsumidorFinal && customerName.trim().length > 0 && customerDocumentId.trim().length > 0 && onSaveCustomer && (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const docVal = validarDocumentoEcuatoriano(customerDocumentId.trim());
                            if (!docVal.valido) {
                              alert(`Documento inválido: ${docVal.mensaje}`);
                              return;
                            }
                            const customerToSave: CustomerDetails = {
                              name: customerName.trim().toUpperCase(),
                              documentId: customerDocumentId.trim(),
                              phone: customerPhone.trim(),
                              address: customerAddress.trim(),
                              email: customerEmail.trim(),
                            };
                            const alreadyExists = customers.some(
                              (c) => c.documentId.trim() === customerToSave.documentId
                            );
                            if (alreadyExists) {
                              setRetroConfirm({
                                message: `El cliente "${customerToSave.name}" ya está registrado. ¿Desea actualizar sus datos?`,
                                onConfirm: () => {
                                  onSaveCustomer!(customerToSave);
                                  showRetroToast(`✅ Datos de "${customerToSave.name}" actualizados.`);
                                },
                              });
                            } else {
                              onSaveCustomer(customerToSave);
                              showRetroToast(`✅ Cliente "${customerToSave.name}" guardado en el directorio.`);
                            }
                          }}
                          className="bg-lime-300 hover:bg-lime-400 border-2 border-black rounded text-[9px] font-black px-2 py-0.5 cursor-pointer uppercase transition-all shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5 text-black animate-bounce"
                          title="Guardar este cliente en el directorio"
                        >
                          💾 Guardar
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={documentType === 'factura' && finalTotal > 50}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (documentType === 'factura' && finalTotal > 50) {
                            showRetroToast('🚫 Facturas mayores a $50.00 no permiten Consumidor Final');
                            return;
                          }
                          setConsumidorFinal();
                        }}
                        className={`border-2 border-black rounded text-[9px] font-black px-2 py-0.5 uppercase transition-all ${
                          documentType === 'factura' && finalTotal > 50
                            ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                            : 'bg-cyan-200 hover:bg-cyan-300 cursor-pointer shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5'
                        }`}
                        title={
                          documentType === 'factura' && finalTotal > 50
                            ? 'Facturas mayores a $50.00 no pueden emitirse a Consumidor Final'
                            : 'Usar Consumidor Final'
                        }
                      >
                        Cons. Final
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          clearCustomerDetails();
                        }}
                        className="bg-rose-200 hover:bg-rose-300 border-2 border-black rounded text-[9px] font-black px-2 py-0.5 cursor-pointer uppercase transition-all shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>

                  {isCustomerAlreadySaved && (
                    <div className="bg-amber-100 border-2 border-black text-amber-950 p-3 rounded-lg text-[10px] font-black uppercase tracking-wide flex items-start gap-2.5 shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)]">
                      <span className="text-lg leading-none">⚠️</span>
                      <div className="text-left">
                        <p className="text-amber-900 font-extrabold text-[10px]">¡El cliente ya existe en la base de datos!</p>
                        <p className="text-[9.5px] font-bold text-amber-800 normal-case mt-0.5 leading-snug">
                          La cédula/RUC/ID <strong className="font-retro-mono">{customerDocumentId}</strong> ya está registrado. Los datos se han cargado automáticamente.
                        </p>
                      </div>
                    </div>
                  )}

                  {documentType === 'factura' && finalTotal > 50 && isConsumidorFinal && (
                    <div className="bg-rose-100 border-2 border-rose-600 text-rose-950 p-3 rounded-lg text-[10px] font-black uppercase tracking-wide flex items-start gap-2.5 shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)]">
                      <span className="text-lg leading-none">🚫</span>
                      <div className="text-left">
                        <p className="text-rose-900 font-extrabold text-[10px]">PROHIBIDO CONSUMIDOR FINAL MAYOR A $50.00 (SRI)</p>
                        <p className="text-[9.5px] font-bold text-rose-800 normal-case mt-0.5 leading-snug">
                          Las facturas por montos mayores a <strong>$50.00 USD</strong> no pueden emitirse a Consumidor Final. Ingrese obligatoriamente los datos del cliente (Cédula/RUC, Nombre, Teléfono, Dirección y Correo).
                        </p>
                      </div>
                    </div>
                  )}

                  {!isConsumidorFinal && !isCustomerDataValid && (
                    <div className="bg-rose-100 border-2 border-rose-500 text-rose-950 p-3 rounded-lg text-[10px] font-black uppercase tracking-wide flex items-start gap-2.5 shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)]">
                      <span className="text-lg leading-none">⚠️</span>
                      <div className="text-left">
                        <p className="text-rose-900 font-extrabold text-[10px]">CAMPOS OBLIGATORIOS REQUERIDOS</p>
                        <p className="text-[9.5px] font-bold text-rose-800 normal-case mt-0.5 leading-snug">
                          Para emitir nota de venta con datos, debe llenar obligatoriamente todos los campos: Nombre, Cédula/RUC/Pasaporte válido, Teléfono, Dirección y Correo electrónico.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2.5 text-xs text-left">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] uppercase font-black text-zinc-700">
                          Nombre o Razón Social {!isConsumidorFinal && <span className="text-rose-600 font-black ml-0.5">*</span>}
                        </label>
                        {isLoadedFromDb && (
                          <span className="bg-emerald-100 text-emerald-800 text-[8.5px] font-black px-1.5 py-0.5 rounded border border-emerald-400 uppercase tracking-wide animate-pulse">
                            💾 Base de Datos Local
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        required={!isConsumidorFinal}
                        placeholder="CONSUMIDOR FINAL"
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          setIsLoadedFromDb(false);
                        }}
                        className={`w-full px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${!isConsumidorFinal && !isNameValid
                            ? 'border-rose-500 bg-rose-50/50 focus:bg-rose-100/50'
                            : 'border-black bg-yellow-50 focus:bg-cyan-50'
                          }`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-zinc-700 mb-1">
                          Cédula, RUC o Pasaporte {!isConsumidorFinal && <span className="text-rose-600 font-black ml-0.5">*</span>}
                        </label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            required={!isConsumidorFinal}
                            placeholder="9999999999"
                            value={customerDocumentId}
                            onChange={(e) => setCustomerDocumentId(e.target.value)}
                            className={`flex-1 min-w-0 px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${!isConsumidorFinal && !isDocValid
                                ? 'border-rose-600 bg-rose-50/50 focus:bg-rose-100/50'
                                : customerDocumentId.trim() && customerDocumentId.trim() !== '9999999999' && validarDocumentoEcuatoriano(customerDocumentId).valido
                                  ? 'border-emerald-600 bg-emerald-50/50 focus:bg-emerald-100/50'
                                  : 'border-black bg-yellow-50 focus:bg-cyan-50'
                              }`}
                          />
                          <button
                            type="button"
                            disabled={isSearchingCedula || !customerDocumentId || customerDocumentId === '9999999999'}
                            onClick={() => lookupCedula(customerDocumentId)}
                            className="bg-cyan-200 hover:bg-cyan-300 disabled:opacity-50 border-2 border-black rounded text-[11px] font-black px-2.5 flex items-center justify-center cursor-pointer transition-all shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5"
                            title="Buscar en Registro Civil"
                          >
                            {isSearchingCedula ? (
                              <RefreshCw className="w-3.5 h-3.5 text-black animate-spin" />
                            ) : (
                              '🔍'
                            )}
                          </button>
                        </div>
                        {customerDocumentId.trim() && customerDocumentId.trim() !== '9999999999' && (
                          <div className="mt-1 space-y-0.5">
                            {(() => {
                              const val = validarDocumentoEcuatoriano(customerDocumentId);
                              return (
                                <div className="flex items-start gap-1">
                                  <span className={`inline-block text-[8px] font-black px-1.5 py-0.2 rounded border uppercase ${val.valido
                                      ? 'bg-emerald-200 text-emerald-900 border-emerald-400'
                                      : 'bg-rose-200 text-rose-950 border-rose-400'
                                    }`}>
                                    {val.valido ? 'Válido' : 'Inválido'}
                                  </span>
                                  <span className={`text-[8.5px] font-bold uppercase leading-tight ${val.valido ? 'text-emerald-700' : 'text-rose-700'
                                    }`}>
                                    [{val.tipo}] {val.mensaje}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        {isSearchingCedula && (
                          <p className="text-[8px] text-cyan-700 font-extrabold mt-1 animate-pulse uppercase">
                            Buscando...
                          </p>
                        )}
                        {searchCedulaError && (
                          <p className="text-[8px] text-red-600 font-extrabold mt-1 uppercase leading-tight">
                            ⚠️ {searchCedulaError}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-black text-zinc-700 mb-1">
                          Número de Teléfono {!isConsumidorFinal && <span className="text-rose-600 font-black ml-0.5">*</span>}
                        </label>
                        <input
                          type="text"
                          required={!isConsumidorFinal}
                          placeholder="Ej: 0999999999"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className={`w-full px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${!isConsumidorFinal && !isPhoneValid
                              ? 'border-rose-500 bg-rose-50/50 focus:bg-rose-100/50'
                              : 'border-black bg-yellow-50 focus:bg-cyan-50'
                            }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] uppercase font-black text-zinc-700 mb-1">
                          Dirección de Domicilio {!isConsumidorFinal && <span className="text-rose-600 font-black ml-0.5">*</span>}
                        </label>
                        <input
                          type="text"
                          required={!isConsumidorFinal}
                          placeholder="S/N"
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          className={`w-full px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${!isConsumidorFinal && !isAddressValid
                              ? 'border-rose-500 bg-rose-50/50 focus:bg-rose-100/50'
                              : 'border-black bg-yellow-50 focus:bg-cyan-50'
                            }`}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-black text-zinc-700 mb-1">
                          Correo Electrónico {!isConsumidorFinal && <span className="text-rose-600 font-black ml-0.5">*</span>}
                        </label>
                        <input
                          type="email"
                          required={!isConsumidorFinal}
                          placeholder="ejemplo@correo.com"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          className={`w-full px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${!isConsumidorFinal && !isEmailValid
                              ? 'border-rose-500 bg-rose-50/50 focus:bg-rose-100/50'
                              : 'border-black bg-yellow-50 focus:bg-cyan-50'
                            }`}
                        />
                        {!isConsumidorFinal && customerEmail.trim().length > 0 && !isValidEmail(customerEmail) && (
                          <p className="text-[8px] text-rose-600 font-extrabold mt-1 uppercase leading-tight">
                            ⚠️ Ingrese un correo válido (ejemplo@correo.com)
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Casilla 8% IVA Feriados en Modal de Pago */}
                <div className={`p-3 rounded-lg border-2 border-black transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${applyHolidayIva8 ? 'bg-amber-300 text-black' : 'bg-white text-zinc-800'
                  }`}>
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={applyHolidayIva8}
                        onChange={(e) => handleToggleHolidayIva8(e.target.checked)}
                        className="w-4 h-4 rounded accent-black cursor-pointer border-2 border-black"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-retro-heavy text-xs uppercase tracking-wide">IVA Feriados Ecuador (8%)</span>
                          <span className="bg-black text-amber-300 text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase">
                            Turismo / Feriados
                          </span>
                        </div>
                        <p className="text-[9.5px] text-zinc-700 font-bold leading-tight">
                          {applyHolidayIva8 ? 'Tarifa reducida del 8% activada por decreto de feriado' : 'Marcar para aplicar tarifa reducida del 8% en feriados'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-retro-mono text-xs font-black bg-black text-lime-400 px-2 py-0.5 rounded">
                        {applyHolidayIva8 ? `Desg. $${formatNum(taxAmount)}` : '15% Normal'}
                      </span>
                    </div>
                  </label>
                </div>

                <div className="border-t border-zinc-300 my-1"></div>

                {/* Stock Warning Notice in Checkout Modal */}
                {(() => {
                  const { hasAgotados, hasStockBajo, agotadosList, lowStockList } = getCartStockStatus();

                  return (
                    <>
                      {hasAgotados && (
                        <div className="bg-rose-100 border-2 border-rose-500 text-rose-950 p-3 rounded-lg text-xs font-bold flex items-start gap-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                          <span className="text-lg leading-none">🚫</span>
                          <div className="text-left">
                            <p className="font-black text-rose-950 uppercase text-[11px]">COBRO BLOQUEADO POR INSUMOS AGOTADOS (STOCK 0)</p>
                            <p className="text-[10.5px] text-rose-900 normal-case mt-0.5">
                              Insumos agotados en esta orden: <strong>{agotadosList.join(', ')}</strong>. No es posible cobrar hasta reabastecer inventario.
                            </p>
                          </div>
                        </div>
                      )}

                      {hasStockBajo && !hasAgotados && (
                        <div className="bg-amber-100 border-2 border-amber-500 text-amber-950 p-3 rounded-lg text-xs font-bold flex items-start gap-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                          <span className="text-lg leading-none">⚠️</span>
                          <div className="text-left">
                            <p className="font-black text-amber-950 uppercase text-[11px]">AVISO DE STOCK BAJO (VENTA PERMITIDA)</p>
                            <p className="text-[10.5px] text-amber-900 normal-case mt-0.5">
                              Insumos con 10 o menos unidades en esta orden: <strong>{lowStockList.join(', ')}</strong>. La venta se puede realizar normalmente.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Payment Method Tabs */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'efectivo', name: 'EFECTIVO', icon: DollarSign },
                    { id: 'tarjeta', name: 'TARJETA', icon: CreditCard },
                    { id: 'transferencia', name: 'TRANSF.', icon: RefreshCw }
                  ].map((method) => {
                    const Icon = method.icon;
                    const isSelected = paymentMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setPaymentMethod(method.id as any)}
                        className={`p-3.5 border-3 border-black rounded-lg text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${isSelected
                            ? 'bg-fuchsia-400 text-black font-black'
                            : 'bg-white text-black hover:bg-zinc-50'
                          }`}
                      >
                        <Icon className="w-5 h-5 text-black stroke-[2.5]" />
                        <span className="text-[10px] uppercase tracking-wider font-extrabold">{method.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Cash Specific Calculations */}
                {paymentMethod === 'efectivo' && (
                  <div className="bg-white rounded-lg p-4 border-3 border-black space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold text-black">
                    <div>
                      <label className="block text-xs uppercase tracking-wider font-black mb-1.5">Efectivo Entregado por Cliente (USD)</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-3 text-black font-black text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={cashReceived}
                          onChange={(e) => setCashReceived(e.target.value)}
                          className="w-full pl-7 pr-3 py-2.5 border-3 border-black bg-yellow-50 rounded-md text-sm font-retro-mono font-black text-black focus:outline-none focus:bg-cyan-50"
                          required
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* Quick Bill Shortcuts */}
                    <div>
                      <span className="block text-[10px] uppercase font-black text-zinc-500 mb-1">Billetes sugeridos:</span>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCashReceived(finalTotal.toFixed(2))}
                          className="bg-yellow-100 hover:bg-yellow-200 border-2 border-black rounded text-[10px] font-black px-2.5 py-1.5 cursor-pointer uppercase transition-all shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5"
                        >
                          Exacto (${formatNum(finalTotal)})
                        </button>
                        {[5, 10, 20, 50, 100].map((bill) => {
                          const isSuggested = bill >= finalTotal;
                          return (
                            <button
                              key={bill}
                              type="button"
                              onClick={() => setCashReceived(bill.toFixed(2))}
                              className={`border-2 border-black rounded text-[10px] font-retro-mono font-black px-2.5 py-1.5 cursor-pointer transition-all shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5 ${isSuggested
                                  ? 'bg-lime-200 hover:bg-lime-300 text-black'
                                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500'
                                }`}
                            >
                              ${bill}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs font-black pt-2.5 border-t-2 border-dashed border-black/30">
                      <span className="uppercase tracking-wide">Cambio a Entregar:</span>
                      <span className="text-lg font-black font-retro-mono bg-lime-300 border-2 border-black px-2 py-0.5 rounded shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                        ${formatNum(getCashChange())} USD
                      </span>
                    </div>
                  </div>
                )}

                {/* Transfer Specific Calculations */}
                {paymentMethod === 'transferencia' && (
                  <div className="bg-white rounded-lg p-4 border-3 border-black space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-bold text-black">
                    <div>
                      <label className="block text-xs uppercase tracking-wider font-black mb-1.5">Número de Transferencia</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Ej. TXN-123456"
                          value={transferNumber}
                          onChange={(e) => setTransferNumber(e.target.value)}
                          className="w-full px-3.5 py-2.5 border-3 border-black bg-yellow-50 rounded-md text-sm font-retro-mono font-black text-black focus:outline-none focus:bg-cyan-50"
                          required
                          autoFocus
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-pink-100 border-t-3 border-black p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-black">
                  <span className="text-zinc-600">Entregar:</span>
                  <span className={`px-2 py-0.5 rounded-md border-2 border-black font-retro-mono text-[11px] shadow-[1.5px_1.5px_0px_0px_#000] ${
                    documentType === 'factura' ? 'bg-cyan-300 text-cyan-950' : 'bg-yellow-300 text-yellow-950'
                  }`}>
                    {documentType === 'factura' ? '🧾 FACTURA SRI' : '📄 NOTA DE VENTA'}
                  </span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCheckoutModal(false)}
                    className="bg-white hover:bg-zinc-100 text-black border-2 border-black rounded-lg px-4.5 py-2.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={
                      (paymentMethod === 'efectivo' && (parseNum(cashReceived) || 0) < finalTotal) ||
                      (paymentMethod === 'transferencia' && !transferNumber.trim()) ||
                      !isCustomerDataValid ||
                      (documentType === 'factura' && finalTotal > 50 && isConsumidorFinal) ||
                      getCartStockStatus().hasAgotados
                    }
                    className={`px-5 py-2.5 rounded-lg text-xs font-black border-2 border-black uppercase tracking-wider shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all cursor-pointer ${((paymentMethod === 'efectivo' && (parseNum(cashReceived) || 0) < finalTotal) ||
                        (paymentMethod === 'transferencia' && !transferNumber.trim()) ||
                        !isCustomerDataValid ||
                        (documentType === 'factura' && finalTotal > 50 && isConsumidorFinal) ||
                        getCartStockStatus().hasAgotados)
                        ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed border-zinc-400 shadow-none'
                        : documentType === 'factura'
                          ? 'bg-cyan-300 hover:bg-cyan-400 text-cyan-950'
                          : 'bg-lime-300 hover:bg-lime-400 text-black'
                      }`}
                    title={
                      getCartStockStatus().hasAgotados
                        ? "Hay insumos en 0 en esta orden. No se puede cobrar."
                        : (documentType === 'factura' && finalTotal > 50 && isConsumidorFinal)
                          ? "Las facturas mayores a $50.00 no pueden emitirse a Consumidor Final"
                          : !isCustomerDataValid
                            ? "Complete todos los campos del cliente para emitir comprobante con datos"
                            : (paymentMethod === 'efectivo' && (parseNum(cashReceived) || 0) < finalTotal)
                              ? "Ingrese el efectivo entregado suficiente"
                              : (paymentMethod === 'transferencia' && !transferNumber.trim())
                                ? "Ingrese el número de transferencia"
                                : "Confirmar y emitir comprobante"
                    }
                  >
                    {documentType === 'factura' ? '🧾 EMITIR FACTURA SRI' : '📄 EMITIR NOTA DE VENTA'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ciclo SRI: Firmando -> Recepción -> Autorización */}
      {sriCycle && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border-4 border-black max-w-lg w-full overflow-hidden shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] rounded-2xl animate-scale-in">
            {/* Cabecera SRI */}
            <div className="bg-gradient-to-r from-cyan-400 via-sky-300 to-yellow-300 border-b-4 border-black p-4 text-black">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🇪🇨</span>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest bg-black text-amber-300 px-2 py-0.5 rounded">
                      SRI FACTURACIÓN ELECTRÓNICA
                    </span>
                    <h3 className="font-retro-heavy text-base uppercase tracking-tight text-black mt-0.5">
                      CICLO DE EMISIÓN FISCAL
                    </h3>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-800 uppercase block">Ambiente</span>
                  <span className="font-retro-mono text-xs font-black bg-white border-2 border-black px-2 py-0.5 rounded shadow-[1.5px_1.5px_0px_0px_#000]">
                    {company?.ambiente === '2' ? 'PRODUCCIÓN' : 'PRUEBAS'}
                  </span>
                </div>
              </div>
            </div>

            {/* Datos Resumen de Factura */}
            <div className="p-5 bg-pink-50 space-y-4 font-bold text-black">
              <div className="bg-white border-3 border-black rounded-xl p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-black block">Factura Nº</span>
                  <span className="font-retro-mono text-sm font-black text-cyan-950">{sriCycle.invoiceNumber}</span>
                </div>
                <div className="text-center truncate max-w-[170px]">
                  <span className="text-[10px] text-zinc-500 uppercase font-black block">Cliente</span>
                  <span className="font-extrabold text-xs uppercase truncate block">{sriCycle.clientName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 uppercase font-black block">Total</span>
                  <span className="font-retro-mono text-sm font-black text-lime-600 bg-lime-100 border border-black px-2 py-0.5 rounded">
                    ${formatNum(sriCycle.total)}
                  </span>
                </div>
              </div>

              {/* Barra de Progreso */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-black uppercase">
                  <span>Progreso del Web Service SRI</span>
                  <span className="font-retro-mono">
                    {sriCycle.step === 'signing' ? '33%' : sriCycle.step === 'reception' ? '66%' : '100%'}
                  </span>
                </div>
                <div className="w-full bg-zinc-200 border-2 border-black rounded-full h-3.5 overflow-hidden p-0.5 shadow-inner">
                  <div
                    className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-amber-400 via-cyan-400 to-lime-400"
                    style={{
                      width:
                        sriCycle.step === 'signing'
                          ? '33%'
                          : sriCycle.step === 'reception'
                          ? '66%'
                          : '100%',
                    }}
                  />
                </div>
              </div>

              {/* Las 3 Fases del Ciclo SRI */}
              <div className="space-y-2.5">
                {/* 1. FIRMANDO */}
                <div className={`p-3 rounded-xl border-3 border-black transition-all flex items-center justify-between gap-3 ${
                  sriCycle.step === 'signing'
                    ? 'bg-amber-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] scale-[1.01]'
                    : 'bg-white'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg border-2 border-black flex items-center justify-center font-bold ${
                      sriCycle.step === 'signing'
                        ? 'bg-amber-300 text-black'
                        : 'bg-lime-300 text-black'
                    }`}>
                      <KeyRound className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase">1. FIRMANDO</p>
                      <p className="text-[10px] text-zinc-600 font-bold">
                        {sriCycle.step === 'signing'
                          ? 'Aplicando firma digital PKCS#12 al comprobante XML...'
                          : 'Firma electrónica válida aplicada con éxito'}
                      </p>
                    </div>
                  </div>
                  <div>
                    {sriCycle.step === 'signing' ? (
                      <span className="inline-flex items-center gap-1.5 bg-amber-300 text-black border-2 border-black px-2 py-1 rounded-md text-[10px] font-black uppercase animate-pulse shadow-[1.5px_1.5px_0px_0px_#000]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Firmando
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-lime-300 text-black border-2 border-black px-2 py-1 rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_#000]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Firmado
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. RECEPCIÓN */}
                <div className={`p-3 rounded-xl border-3 border-black transition-all flex items-center justify-between gap-3 ${
                  sriCycle.step === 'reception'
                    ? 'bg-cyan-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] scale-[1.01]'
                    : sriCycle.step === 'authorization' || sriCycle.step === 'done'
                    ? 'bg-white'
                    : 'bg-zinc-100 opacity-60'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg border-2 border-black flex items-center justify-center font-bold ${
                      sriCycle.step === 'reception'
                        ? 'bg-cyan-300 text-black'
                        : sriCycle.step === 'authorization' || sriCycle.step === 'done'
                        ? 'bg-lime-300 text-black'
                        : 'bg-zinc-200 text-zinc-500'
                    }`}>
                      <Send className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase">2. RECEPCIÓN</p>
                      <p className="text-[10px] text-zinc-600 font-bold">
                        {sriCycle.step === 'reception'
                          ? 'Enviando y validando estructura en Web Service SRI...'
                          : sriCycle.step === 'authorization' || sriCycle.step === 'done'
                          ? 'Comprobante recibido y validado por el SRI'
                          : 'En espera de firma digital...'}
                      </p>
                    </div>
                  </div>
                  <div>
                    {sriCycle.step === 'reception' ? (
                      <span className="inline-flex items-center gap-1.5 bg-cyan-300 text-black border-2 border-black px-2 py-1 rounded-md text-[10px] font-black uppercase animate-pulse shadow-[1.5px_1.5px_0px_0px_#000]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Recibiendo
                      </span>
                    ) : sriCycle.step === 'authorization' || sriCycle.step === 'done' ? (
                      <span className="inline-flex items-center gap-1 bg-lime-300 text-black border-2 border-black px-2 py-1 rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_#000]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Recibido
                      </span>
                    ) : (
                      <span className="text-[10px] font-extrabold text-zinc-400 uppercase">
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. AUTORIZACIÓN */}
                <div className={`p-3 rounded-xl border-3 border-black transition-all flex items-center justify-between gap-3 ${
                  sriCycle.step === 'authorization'
                    ? 'bg-purple-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] scale-[1.01]'
                    : sriCycle.step === 'done'
                    ? 'bg-lime-100 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-zinc-100 opacity-60'
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg border-2 border-black flex items-center justify-center font-bold ${
                      sriCycle.step === 'authorization'
                        ? 'bg-purple-300 text-black'
                        : sriCycle.step === 'done'
                        ? 'bg-lime-400 text-black'
                        : 'bg-zinc-200 text-zinc-500'
                    }`}>
                      <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase">3. AUTORIZACIÓN</p>
                      <p className="text-[10px] text-zinc-600 font-bold">
                        {sriCycle.step === 'authorization'
                          ? 'Consultando resolución fiscal y clave de acceso...'
                          : sriCycle.step === 'done'
                          ? '¡AUTORIZADO! Comprobante con plena validez tributaria'
                          : 'En espera de recepción SRI...'}
                      </p>
                    </div>
                  </div>
                  <div>
                    {sriCycle.step === 'authorization' ? (
                      <span className="inline-flex items-center gap-1.5 bg-purple-300 text-black border-2 border-black px-2 py-1 rounded-md text-[10px] font-black uppercase animate-pulse shadow-[1.5px_1.5px_0px_0px_#000]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Autorizando
                      </span>
                    ) : sriCycle.step === 'done' ? (
                      <span className="inline-flex items-center gap-1 bg-lime-400 text-black border-2 border-black px-2.5 py-1 rounded-md text-[10px] font-black uppercase shadow-[1.5px_1.5px_0px_0px_#000]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        AUTORIZADO
                      </span>
                    ) : (
                      <span className="text-[10px] font-extrabold text-zinc-400 uppercase">
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Clave de Acceso SRI */}
              {sriCycle.accessKey && (
                <div className="bg-white border-2 border-black p-2.5 rounded-lg text-left space-y-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <span className="text-[9px] font-black uppercase text-zinc-600 tracking-wider flex items-center justify-between">
                    <span>Clave de Acceso / Número de Autorización (49 dígitos):</span>
                    {sriCycle.step === 'done' && <span className="text-emerald-700 font-extrabold">VERIFICADA ✓</span>}
                  </span>
                  <p className="font-retro-mono text-[9px] break-all bg-yellow-50 border border-yellow-400 p-1.5 rounded font-bold text-black select-all">
                    {sriCycle.accessKey}
                  </p>
                </div>
              )}

              {/* Pie con Estado Final */}
              <div className="text-center pt-1">
                {sriCycle.step === 'done' ? (
                  <div className="bg-lime-300 border-2 border-black p-2.5 rounded-xl font-retro-heavy text-xs uppercase tracking-wide flex items-center justify-center gap-2 shadow-[2px_2px_0px_0px_#000] animate-bounce">
                    <span>🎉</span>
                    <span>¡FACTURA AUTORIZADA EXITOSAMENTE POR EL SRI!</span>
                  </div>
                ) : (
                  <p className="text-[11px] font-bold text-zinc-600 uppercase flex items-center justify-center gap-1.5 animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    <span>Conectando con el Servidor del SRI... Por favor espere</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Ticket Preview */}
      {recentSaleTicket && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border-4 border-black max-w-sm w-full overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-xl">
            {/* Simulation Header */}
            <div className="bg-purple-400 text-black border-b-4 border-black p-4 flex items-center justify-between text-xs font-black uppercase tracking-wider">
              <span className="flex items-center gap-1.5 font-retro-heavy">
                <Sparkles className="w-4 h-4 text-black stroke-[2.5]" />
                VENTA EXITOSA
              </span>
              <button
                onClick={() => setRecentSaleTicket(null)}
                className="bg-red-400 hover:bg-red-500 border-2 border-black text-black px-2 py-0.5 rounded font-black cursor-pointer"
              >
                ✕
              </button>
            </div>



            {/* Ticket Canvas */}
            <div className="p-5 font-retro-mono text-black text-xs leading-relaxed space-y-4 max-h-[440px] overflow-y-auto bg-white border-b-4 border-black shadow-inner printable-ticket" id="ticket-print-area">
              <div className="text-center space-y-1">
                <div className="mx-auto w-10 h-10 text-black border-2 border-black bg-yellow-300 rounded-full flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <Coffee className="w-5 h-5 stroke-[2.5]" />
                </div>
                <h4 className="text-sm font-black uppercase tracking-widest pt-2">
                  {company?.nombreComercial || company?.razonSocial || businessName || 'Cafetería Espresso'}
                </h4>
                <p className="text-[10px] text-zinc-600 font-extrabold">
                  RUC: {company?.ruc || '1725403883001'}
                </p>
                <p className="text-[10px] text-zinc-600 font-bold uppercase">
                  {company?.dirEstablecimiento || company?.dirMatriz || 'GUAMANÍ - VICTORIA CENTRAL / PEDRO VICENTE MALDONADO ESQ S59D / S59-190 / S59D'}
                </p>
                <div className="py-1">
                  <p className="text-[9px] text-black font-black uppercase tracking-wider border-y-2 border-dashed border-black/40 py-1">
                    {recentSaleTicket.documentType === 'factura' ? '*** FACTURA ELECTRÓNICA ***' : '*** NOTA DE VENTA ***'}
                  </p>
                </div>
              </div>

              <div className="space-y-1 text-[10px] text-black font-bold border-b-2 border-dashed border-black/40 pb-3">
                <div className="flex justify-between">
                  <span>{recentSaleTicket.documentType === 'factura' ? 'Nº FACTURA:' : 'Nº NOTA DE VENTA:'}</span>
                  <span className={`font-black text-xs border border-black px-1 rounded ${
                    recentSaleTicket.documentType === 'factura' ? 'bg-cyan-100' : 'bg-yellow-100'
                  }`}>
                    {recentSaleTicket.invoiceNumber || recentSaleTicket.id}
                  </span>
                </div>
                {recentSaleTicket.accessKey && (
                  <div className="text-[9px] space-y-0.5 pt-0.5">
                    <span className="text-zinc-600">CLAVE DE ACCESO:</span>
                    <p className="font-retro-mono text-[8.5px] break-all bg-zinc-50 border border-zinc-300 p-1 rounded font-bold">
                      {recentSaleTicket.accessKey}
                    </p>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>FECHA:</span>
                  <span>{new Date(recentSaleTicket.timestamp).toLocaleString('es-ES')}</span>
                </div>
                <div className="flex justify-between">
                  <span>OPERADOR:</span>
                  <span className="font-extrabold">{recentSaleTicket.employeeName.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span>FORMA DE PAGO:</span>
                  <span className="font-extrabold bg-cyan-200 border border-black px-1 rounded">{recentSaleTicket.paymentMethod.toUpperCase()}</span>
                </div>
                {recentSaleTicket.transferNumber && (
                  <div className="flex justify-between text-pink-600">
                    <span>REF. TRANSF:</span>
                    <span className="font-extrabold bg-pink-100 border border-pink-300 px-1 rounded">{recentSaleTicket.transferNumber.toUpperCase()}</span>
                  </div>
                )}
              </div>

              {/* DATOS DEL CLIENTE EN EL TICKET */}
              {recentSaleTicket.customer && (
                <div className="text-[10px] text-black font-bold space-y-1 bg-zinc-50 border border-black p-2 rounded">
                  <p className="text-[9px] font-black uppercase text-zinc-500 tracking-wider mb-1">CLIENTE / FACTURACIÓN</p>
                  <div>
                    <span className="text-zinc-600">NOMBRE: </span>
                    <span className="font-extrabold uppercase">{recentSaleTicket.customer.name}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600">CI/RUC/PAS: </span>
                    <span className="font-extrabold">{recentSaleTicket.customer.documentId}</span>
                  </div>
                  {recentSaleTicket.customer.phone && (
                    <div>
                      <span className="text-zinc-600">TELÉFONO: </span>
                      <span className="font-extrabold">{recentSaleTicket.customer.phone}</span>
                    </div>
                  )}
                  {recentSaleTicket.customer.address && (
                    <div>
                      <span className="text-zinc-600">DIRECCIÓN: </span>
                      <span className="font-extrabold uppercase">{recentSaleTicket.customer.address}</span>
                    </div>
                  )}
                  {recentSaleTicket.customer.email && (
                    <div className="truncate">
                      <span className="text-zinc-600">EMAIL: </span>
                      <span className="font-semibold text-[9px]">{recentSaleTicket.customer.email}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Items list */}
              <div className="border-t-2 border-dashed border-black/40 pt-3 space-y-2">
                <div className="flex justify-between font-black text-[10px] text-black pb-1">
                  <span className="w-1/2">CONCEPTO</span>
                  <span className="w-1/6 text-center">CANT</span>
                  <span className="w-1/3 text-right">TOTAL</span>
                </div>

                {recentSaleTicket.items.map((it, idx) => {
                  const menuItem = menuItems.find(m => m.id === it.menuItemId);
                  const isShortage = menuItem ? hasIngredientShortage(menuItem) : false;
                  return (
                    <div key={idx} className="space-y-1 py-1 border-b border-dashed border-zinc-100 last:border-0">
                      <div className="flex justify-between text-[10px] text-black font-bold">
                        <span className="w-1/2 truncate">
                          {it.name.toUpperCase()}
                          {it.discountPercent && it.discountPercent > 0 ? ` (-${it.discountPercent}%)` : ''}
                        </span>
                        <span className="w-1/6 text-center">{it.quantity}</span>
                        <span className="w-1/3 text-right">
                          {it.discountPercent && it.discountPercent > 0 ? (
                            <span>
                              <span className="line-through text-zinc-400 text-[8px] mr-1">
                                ${formatNum(it.price * it.quantity)}
                              </span>
                              ${formatNum((it.price * it.quantity) * (1 - it.discountPercent / 100))}
                            </span>
                          ) : (
                            `$${formatNum(it.price * it.quantity)}`
                          )}
                        </span>
                      </div>
                      {isShortage && (
                        <div className="bg-red-50 text-red-600 text-[8px] p-1 border border-red-200 rounded font-bold uppercase text-left leading-normal">
                          ⚠️ A ESTE PRODUCTO LE FALTAN INGREDIENTES. POR FAVOR, VERIFICA QUE EL STOCK ESTÉ LLENO.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t-2 border-dashed border-black/40 pt-3 space-y-1 text-right text-[10px] text-black font-bold">
                <div className="flex justify-between">
                  <span>Subtotal (Sin IVA):</span>
                  <span>${formatNum(recentSaleTicket.total - (recentSaleTicket.tax || 0))}</span>
                </div>
                {recentSaleTicket.discount && recentSaleTicket.discount > 0 ? (
                  <div className="flex justify-between text-rose-600">
                    <span>Descuento:</span>
                    <span>-${formatNum(recentSaleTicket.discount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span>
                    {recentSaleTicket.taxRate && recentSaleTicket.taxRate > 0
                      ? `IVA (${Math.round(recentSaleTicket.taxRate * 100)}% Desglosado):`
                      : 'IVA (0%):'}
                  </span>
                  <span>${formatNum(recentSaleTicket.tax || 0)}</span>
                </div>
                <div className="flex justify-between font-black text-sm text-black pt-2 border-t-2 border-dashed border-black/40 bg-yellow-100 p-1 rounded">
                  <span className="uppercase text-[10px]">TOTAL PVP:</span>
                  <span>${formatNum(recentSaleTicket.total)} USD</span>
                </div>

                {recentSaleTicket.paymentMethod === 'efectivo' && (
                  <div className="pt-2.5 space-y-1.5 border-t-2 border-dashed border-black/30 font-retro-mono text-right text-[10px] text-black">
                    <div className="flex justify-between font-bold text-zinc-600">
                      <span>ENTREGADO:</span>
                      <span>${formatNum(recentSaleTicket.cashReceived || 0)} USD</span>
                    </div>
                    <div className="flex justify-between font-black text-xs text-lime-700 bg-lime-100 border border-lime-400 p-1 rounded">
                      <span className="uppercase">SU VUELTO:</span>
                      <span>${formatNum(recentSaleTicket.changeGiven || 0)} USD</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t-2 border-dashed border-black/40 pt-3.5 text-center space-y-1">
                <p className="text-[10px] font-black tracking-wider uppercase">¡GRACIAS POR TU VISITA!</p>
                <p className="text-[9px] text-zinc-600 font-bold">ARCADE POS SYSTEM V9 • PLAY AGAIN</p>
              </div>
            </div>

            {/* Print & Email actions */}
            <div className="bg-pink-100 border-t-3 border-black p-4 space-y-2">
              {company && (
                <div className="bg-emerald-100 border-2 border-black rounded-lg p-2 space-y-1.5">
                  <div className="text-[10px] font-black uppercase text-black flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>
                      {recentSaleTicket.documentType === 'factura'
                        ? 'Enviar RIDE + XML al Correo:'
                        : 'Enviar Nota de Venta al Correo:'}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="email"
                      placeholder="correo@cliente.com"
                      value={ticketEmailInput}
                      onChange={(e) => setTicketEmailInput(e.target.value)}
                      className="flex-1 bg-white border-2 border-black rounded px-2.5 py-1 text-xs font-bold text-black focus:outline-none min-w-0"
                    />
                    <button
                      type="button"
                      disabled={isSendingTicketEmail}
                      onClick={async () => {
                        if (!company) return;
                        setIsSendingTicketEmail(true);
                        const res = await sendSaleComprobanteEmail(recentSaleTicket, company, ticketEmailInput);
                        setIsSendingTicketEmail(false);
                        showRetroToast(res.success ? `✅ ${res.message}` : `❌ ${res.error}`);
                      }}
                      className="bg-emerald-400 hover:bg-emerald-500 text-black border-2 border-black rounded px-3 py-1 text-[10px] font-black uppercase cursor-pointer shadow-[1.5px_1.5px_0px_0px_#000] shrink-0 flex items-center gap-1"
                    >
                      <Mail className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>{isSendingTicketEmail ? 'Enviando...' : 'Enviar'}</span>
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const saleToPreview = recentSaleTicket;
                    setRecentSaleTicket(null);
                    setPreviewRideSale(saleToPreview);
                  }}
                  className="flex-1 bg-pink-300 hover:bg-pink-400 text-black border-2 border-black rounded-lg py-2.5 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-4 h-4 stroke-[2.5]" />
                  VER RIDE
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (company) {
                      if (recentSaleTicket.documentType === 'factura') {
                        exportSaleRidePdf(recentSaleTicket, company);
                        showRetroToast('✅ RIDE Oficial SRI descargado');
                      } else {
                        exportNotaVentaPdf(recentSaleTicket, company);
                        showRetroToast('✅ Nota de Venta PDF descargada');
                      }
                    }
                  }}
                  className="flex-1 bg-cyan-300 hover:bg-cyan-400 text-cyan-950 border-2 border-black rounded-lg py-2.5 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  {recentSaleTicket.documentType === 'factura' ? 'PDF RIDE' : 'PDF NOTA VENTA'}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTriggerPrint}
                  className="flex-1 border-2 border-black bg-white hover:bg-zinc-100 rounded-lg py-2.5 text-xs font-black uppercase tracking-wider text-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                >
                  <Printer className="w-4 h-4 stroke-[2.5]" />
                  IMPRIMIR TICKET
                </button>
                <button
                  type="button"
                  onClick={() => setRecentSaleTicket(null)}
                  className="flex-1 bg-yellow-300 hover:bg-yellow-400 text-black border-2 border-black rounded-lg py-2.5 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all cursor-pointer text-center"
                >
                  OTRA VENTA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL VISTA PREVIA RIDE ── */}
      {previewRideSale && company && (
        <RidePreviewModal
          invoice={saleToElectronicInvoice(previewRideSale, company)}
          company={company}
          documentLabel={previewRideSale.documentType === 'factura' ? 'FACTURA' : 'NOTA DE VENTA'}
          onClose={() => setPreviewRideSale(null)}
          onViewTicket={() => {
            const saleForTicket = previewRideSale;
            setPreviewRideSale(null);
            setRecentSaleTicket(saleForTicket);
          }}
        />
      )}

      {/* ── RETRO CONFIRM MODAL ── */}
      {retroConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-[100]">
          <div className="bg-white border-4 border-black rounded-xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-sm overflow-hidden">
            <div className="bg-amber-300 border-b-4 border-black px-5 py-3">
              <p className="font-retro-heavy text-sm uppercase text-black">⚠️ ATENCIÓN</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-bold text-black leading-snug">{retroConfirm.message}</p>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setRetroConfirm(null)}
                  className="flex-1 bg-white hover:bg-zinc-100 border-3 border-black text-black font-black text-xs uppercase py-2.5 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    retroConfirm.onConfirm();
                    setRetroConfirm(null);
                  }}
                  className="flex-1 bg-lime-300 hover:bg-lime-400 border-3 border-black text-black font-black text-xs uppercase py-2.5 rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer"
                >
                  ✅ Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RETRO TOAST NOTIFICATION ── */}
      {retroToast && (
        <div className="fixed bottom-6 right-6 z-[100] animate-fade-in">
          <div className="bg-lime-300 border-3 border-black text-black font-black text-xs uppercase px-5 py-3 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 max-w-xs">
            <span className="text-base">✅</span>
            <span>{retroToast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
