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
  Coffee
} from 'lucide-react';
import { MenuItem, Ingredient, SaleItem, Sale, Shift, Employee, CustomerDetails } from '../types';
import { formatNum, parseNum } from '../utils';

interface POSViewProps {
  businessName: string;
  menuItems: MenuItem[];
  ingredients: Ingredient[];
  activeShift: Shift | null;
  activeEmployee: Employee | null;
  shiftsHistory: Shift[];
  sales: Sale[];
  customers?: CustomerDetails[];
  onRegisterSale: (
    saleItems: SaleItem[], 
    paymentMethod: 'efectivo' | 'tarjeta' | 'transferencia',
    cashReceived?: number,
    changeGiven?: number,
    transferNumber?: string,
    customer?: CustomerDetails,
    invoiceNumber?: string,
    discount?: number
  ) => void;
  onSaveCustomer?: (customer: CustomerDetails) => void;
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
  onRegisterSale,
  onSaveCustomer,
}: POSViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [cart, setCart] = useState<{ menuItem: MenuItem; quantity: number; discountPercent?: number }[]>([]);
  
  // Checkout & Ticket states
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [cashReceived, setCashReceived] = useState('');
  const [transferNumber, setTransferNumber] = useState('');
  const [recentSaleTicket, setRecentSaleTicket] = useState<Sale | null>(null);

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
      const proxyUrl = 'https://infoplacas.herokuapp.com/';
      const targetUrl = 'https://si.secap.gob.ec/sisecap/logeo_web/json/busca_persona_registro_civil.php';

      const response = await fetch(proxyUrl + targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ documento: cleanCedula, tipo: '1' })
      });

      if (!response.ok) {
        throw new Error(`Error en servidor: ${response.status}`);
      }

      const text = await response.text();
      console.log('Lookup Cedula Response:', text);

      let data: any;
      try {
        data = JSON.parse(text);
      } catch (e) {
        if (text && !text.includes('<html') && text.length < 150) {
          const name = text.trim();
          if (name) {
            setCustomerName(name.toUpperCase());
            return;
          }
        }
        throw new Error('Formato de respuesta inválido');
      }

      if (data) {
        const hasRealError = (() => {
          if (!data.error) return false;
          if (typeof data.error === 'boolean') return data.error;
          if (typeof data.error === 'string') {
            const normalized = data.error.trim().toUpperCase();
            if (normalized === 'CONSULTA REALIZADA' || normalized === 'OK' || normalized === 'SUCCESS' || normalized === '') {
              return false;
            }
            return true;
          }
          return true;
        })();

        if (hasRealError || data.message === 'No encontrado' || data.error_msg) {
          throw new Error(data.error || data.message || data.error_msg || 'Cédula no encontrada');
        }

        const candidateObject = data.data || data.result || data.persona || data.person || data;
        const keys = [
          'nombre', 'nombres', 'nombreCompleto', 'nombre_completo', 'fullName', 
          'nombres_completos', 'name', 'nombre_completo_registro_civil', 'display_name'
        ];
        
        let foundName = '';
        for (const key of keys) {
          if (candidateObject[key] && typeof candidateObject[key] === 'string') {
            foundName = candidateObject[key];
            break;
          }
        }

        if (!foundName) {
          const first = candidateObject.nombres || candidateObject.first_name || candidateObject.nombre;
          const last = candidateObject.apellidos || candidateObject.last_name || candidateObject.apellido;
          if (first && last) {
            foundName = `${first} ${last}`;
          } else if (first) {
            foundName = String(first);
          } else if (last) {
            foundName = String(last);
          }
        }

        if (!foundName && typeof candidateObject === 'object') {
          const stringVals = Object.values(candidateObject).filter(v => typeof v === 'string' && v.length > 3 && !v.includes('{'));
          if (stringVals.length > 0) {
            const likelyName = stringVals.find(v => (v as string).split(' ').length >= 2);
            if (likelyName) {
              foundName = String(likelyName);
            }
          }
        }

        if (foundName && foundName.trim()) {
          setCustomerName(foundName.trim().toUpperCase());
        } else {
          throw new Error('No se pudo extraer el nombre del cliente');
        }
      } else {
        throw new Error('Respuesta vacía');
      }
    } catch (err: any) {
      console.error('Error in lookupCedula:', err);
      setSearchCedulaError(err.message || 'Cédula no encontrada');
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

  // Pre-tax calculations
  const subtotal = getCartSubtotal();
  const taxRate = 0.0; // 0% IVA
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const getAppliedDiscount = () => {
    return cart.reduce((tot, item) => {
      const itemSubtotal = item.menuItem.price * item.quantity;
      const itemDiscPercent = item.discountPercent || 0;
      return tot + (itemSubtotal * itemDiscPercent) / 100;
    }, 0);
  };

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

  const handleCheckoutClick = () => {
    setPaymentMethod('efectivo');
    setCashReceived('');
    setTransferNumber('');
    clearCustomerDetails();
    setShowCheckoutModal(true);
  };

  const handleProcessPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    if (!isConsumidorFinal && !isCustomerDataValid) {
      alert('Para emitir la nota de venta con datos del cliente, debe completar obligatoriamente todos los campos: Nombre, Cédula/RUC/Pasaporte válido, Teléfono, Dirección y Correo electrónico.');
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
    }));

    const appliedDiscount = getAppliedDiscount();
    const finalTotal = Math.max(0, total - appliedDiscount);

    const rcv = paymentMethod === 'efectivo' ? (parseNum(cashReceived) || 0) : undefined;
    const chg = paymentMethod === 'efectivo' ? getCashChange() : undefined;
    const tfNum = paymentMethod === 'transferencia' ? transferNumber : undefined;

    // Calculate sequential ticket invoice number from current sales list
    const nextInvoiceNumber = (() => {
      let maxNum = 0;
      sales.forEach(s => {
        if (s.invoiceNumber) {
          const num = parseInt(s.invoiceNumber.replace('#', ''), 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
      return `#${String(maxNum + 1).padStart(6, '0')}`;
    })();

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
      subtotal: total
    };

    onRegisterSale(saleItems, paymentMethod, rcv, chg, tfNum, custDetails, nextInvoiceNumber, appliedDiscount);
    setRecentSaleTicket(mockTicket);
    setCart([]);
    setShowCheckoutModal(false);
  };

  const getCashChange = () => {
    const received = parseNum(cashReceived) || 0;
    const finalTotal = Math.max(0, total - getAppliedDiscount());
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-8" id="pos-container">
      {/* Products list area */}
      <div className="lg:col-span-8 flex flex-col gap-6">

        {/* Global Stock Status Banners */}
        {(() => {
          const lowIngs = ingredients.filter((i) => i.stock > 0 && i.stock <= 10);
          const outIngs = ingredients.filter((i) => i.stock <= 0);

          if (lowIngs.length === 0 && outIngs.length === 0) return null;

          return (
            <div className="space-y-3">
              {lowIngs.length > 0 && (
                <div className="bg-amber-100 border-3 border-amber-500 text-amber-950 p-3.5 rounded-xl text-xs font-bold flex items-start gap-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                  <span className="text-xl leading-none">⚠️</span>
                  <div className="text-left">
                    <p className="font-black text-amber-900 uppercase text-[11px] tracking-wide">AVISO: INSUMOS CON STOCK BAJO (≤ 10 UNIDADES)</p>
                    <p className="text-[10.5px] text-amber-900 font-semibold mt-0.5">
                      Insumos con 10 o menos unidades: {' '}
                      <strong>{lowIngs.map((i) => `${i.name} (${i.stock} ${i.unit})`).join(', ')}</strong>.
                      <span className="text-emerald-800 font-black ml-1">Se puede continuar creando y cobrando notas de venta normalmente.</span>
                    </p>
                  </div>
                </div>
              )}

              {outIngs.length > 0 && (
                <div className="bg-rose-100 border-3 border-rose-500 text-rose-950 p-3.5 rounded-xl text-xs font-bold flex items-start gap-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                  <span className="text-xl leading-none">🚫</span>
                  <div className="text-left">
                    <p className="font-black text-rose-950 uppercase text-[11px] tracking-wide">INSUMOS AGOTADOS (STOCK 0)</p>
                    <p className="text-[10.5px] text-rose-900 font-semibold mt-0.5">
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
        <div className="bg-white border-4 border-black rounded-xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-4 w-5 h-5 text-black stroke-[2.5]" />
            <input
              type="text"
              placeholder="Escribe para buscar capuchinos, lattes, donas, postres..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 border-3 border-black rounded-lg text-sm font-extrabold focus:outline-none focus:bg-cyan-50 bg-pink-50 font-retro-mono text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 sm:gap-2 sm:gap-2.5 pt-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1.5 sm:px-3.5 sm:py-2 md:px-4.5 md:py-2.5 border-2 sm:border-3 border-black rounded-md sm:rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  selectedCategory === cat.id
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6" id="products-grid">
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
                className={`relative bg-white border-2 sm:border-3 border-black rounded-lg sm:rounded-xl p-3 sm:p-4 flex flex-col justify-between text-left transition-all duration-150 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] sm:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] min-h-[175px] sm:min-h-[190px] h-full ${
                  isOutOfStock 
                    ? 'opacity-40 cursor-not-allowed bg-zinc-200'
                    : 'hover:bg-yellow-50 hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] cursor-pointer group'
                }`}
              >
                <div className="w-full">
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className={`inline-block px-2 py-0.5 rounded border-2 border-black text-[9px] font-black tracking-wider uppercase ${categoryMeta.bg} text-black`}>
                      {categoryMeta.text}
                    </span>
                    {!(item.category === 'reposteria' || item.category === 'alimentos' || item.category === 'combos') && (
                      <span className="text-[10px] font-retro-mono bg-black text-lime-400 px-1.5 py-0.2 rounded font-bold">
                        x{maxAvailable}
                      </span>
                    )}
                  </div>
                  
                  <h4 className="font-retro-heavy text-sm text-black group-hover:text-purple-900 transition-colors break-words whitespace-normal leading-snug">
                    {item.name}
                  </h4>
                  <p className="text-[11px] text-zinc-600 line-clamp-2 mt-1 leading-snug font-bold font-sans">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center justify-between w-full mt-2 pt-2.5 border-t-2 border-dashed border-black/30">
                  <span className="font-retro-mono font-black text-black text-sm bg-yellow-300 px-2 py-0.5 border-2 border-black rounded shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                    ${formatNum(item.price)}
                  </span>
                  
                  {isOutOfStock ? (
                    <span className="text-[10px] font-black uppercase text-white bg-red-500 border-2 border-black rounded px-1.5 py-0.5 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                      Agotado
                    </span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-wider text-black bg-cyan-300 border-2 border-black px-1.5 py-0.5 rounded shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)] group-hover:bg-cyan-400 flex items-center gap-0.5">
                      <Plus className="w-3 h-3 stroke-[3]" />
                      SUMAR
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="col-span-full bg-white border-4 border-dashed border-black rounded-xl p-10 text-center" id="no-products-found">
              <Receipt className="w-12 h-12 text-black mx-auto mb-3 stroke-[1.5] animate-bounce" />
              <p className="font-retro-heavy text-base text-black uppercase">SIN COINCIDENCIAS</p>
              <p className="text-xs text-zinc-600 font-bold max-w-sm mx-auto mt-2 leading-relaxed">
                No se encontraron artículos con ese filtro. Revisa el buscador o agrega especialidades en la pestaña del menú.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cart & Billing details */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        <div className="bg-white border-4 border-black rounded-xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between overflow-hidden lg:sticky lg:top-[160px] h-[calc(100vh-185px)] min-h-[580px]" id="pos-cart-panel">
          {/* Cart Header */}
          <div className="border-b-4 border-black px-5 py-3.5 bg-pink-300 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 text-black">
              <ShoppingCart className="w-5 h-5 stroke-[2.5]" />
              <span className="font-retro-heavy text-sm uppercase">ORDEN DE COBRO</span>
              <span className="bg-black text-lime-400 border-2 border-black rounded-md text-[10px] font-retro-mono font-bold px-2 py-0.5 shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,1)]">
                {cart.reduce((sum, i) => sum + i.quantity, 0)} ITEMS
              </span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="bg-red-400 hover:bg-red-500 border-2 border-black text-black px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5"
              >
                LIMPIAR
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto px-3 py-2 bg-pink-50/20 space-y-2">
            {cart.map((cartItem) => (
              <div key={cartItem.menuItem.id} className="p-3 bg-white border-2 border-black rounded-xl shadow-[2.5px_2.5px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-2 text-black">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-black uppercase tracking-wide break-words leading-tight">{cartItem.menuItem.name}</p>
                    <p className="text-[11px] text-zinc-600 font-retro-mono mt-0.5 font-bold">
                      ${formatNum(cartItem.menuItem.price)} c/u
                      {cartItem.discountPercent ? cartItem.discountPercent > 0 && (
                        <span className="ml-1.5 bg-rose-500 text-white px-1.5 py-0.5 rounded text-[9px] font-black uppercase">
                          -{cartItem.discountPercent}% desc
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="text-right flex flex-col items-end shrink-0">
                    <p className="text-xs font-retro-mono font-black bg-black text-yellow-300 px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                      {cartItem.discountPercent && cartItem.discountPercent > 0 ? (
                        <span>
                          <span className="line-through text-zinc-400 text-[10px] mr-1">
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
                      className="text-[9px] text-red-600 hover:text-red-800 font-black uppercase tracking-wider mt-1 cursor-pointer block"
                    >
                      QUITAR
                    </button>
                  </div>
                </div>

                {/* Adjust quantities & discount */}
                <div className="flex items-center justify-between pt-1.5 border-t-2 border-dashed border-zinc-200 gap-2">
                  <div className="flex items-center gap-1.5 bg-yellow-100 border-2 border-black rounded-lg p-0.5 shadow-[1.5px_1.5px_0px_0px_rgba(0,0,0,1)]">
                    <button
                      onClick={() => handleUpdateQuantity(cartItem.menuItem.id, -1)}
                      className="p-1 hover:bg-red-200 rounded text-black font-black cursor-pointer transition-colors"
                    >
                      <Minus className="w-3 h-3 stroke-[3]" />
                    </button>
                    <span className="font-retro-mono text-xs font-black w-6 text-center">
                      {cartItem.quantity}
                    </span>
                    <button
                      onClick={() => handleUpdateQuantity(cartItem.menuItem.id, 1)}
                      className="p-1 hover:bg-lime-200 rounded text-black font-black cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3 stroke-[3]" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 bg-zinc-50 border-2 border-black border-dashed px-2 py-0.5 rounded-lg text-[10px]">
                    <span className="text-zinc-600 font-black uppercase text-[9px]">Desc:</span>
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
                      className="w-10 text-right bg-yellow-50 px-1 py-0.5 border border-black rounded text-xs font-retro-mono font-bold text-black focus:outline-none focus:bg-pink-100"
                    />
                    <span className="font-black">%</span>
                  </div>
                </div>
              </div>
            ))}

            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center text-zinc-500 font-bold">
                <ShoppingCart className="w-12 h-12 stroke-[1.5] text-black mb-3 animate-pulse" />
                <p className="font-retro-heavy text-sm uppercase text-black">CARRITO VACÍO</p>
                <p className="text-xs text-zinc-600 px-6 mt-2 leading-relaxed font-sans font-semibold">
                  Haz click en las tarjetas de productos para cargar el ticket de compra.
                </p>
              </div>
            )}
          </div>

          {/* Checkout Totals & Submit */}
          <div className="border-t-4 border-black p-4 bg-cyan-200 space-y-3 shrink-0">
            <div className="space-y-2 text-xs text-black font-bold">
              <div className="flex justify-between">
                <span>Subtotal Neto:</span>
                <span className="font-retro-mono text-sm">${formatNum(subtotal)}</span>
              </div>
              {getAppliedDiscount() > 0 && (
                <div className="flex justify-between text-rose-600 font-extrabold">
                  <span>Descuento total de productos:</span>
                  <span className="font-retro-mono text-sm">-${formatNum(getAppliedDiscount())}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>IVA (0%):</span>
                <span className="font-retro-mono text-sm">${formatNum(taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-black pt-3 text-black font-black text-sm">
                <span className="font-retro-heavy uppercase text-xs">TOTAL A COBRAR:</span>
                <span className="font-retro-mono text-xl bg-yellow-300 border-2 border-black px-2 py-0.5 rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  ${formatNum(Math.max(0, total - getAppliedDiscount()))} USD
                </span>
              </div>
            </div>

            <button
              disabled={cart.length === 0}
              onClick={handleCheckoutClick}
              className={`w-full py-3.5 rounded-lg text-xs font-black border-3 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all text-center uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer ${
                cart.length === 0
                  ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed border-zinc-400 shadow-none'
                  : 'bg-lime-300 hover:bg-lime-400 hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px]'
              }`}
            >
              <Receipt className="w-4 h-4 stroke-[2.5]" />
              PROCESAR PAGO ($)
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
                <h3 className="font-retro-heavy text-base uppercase">💳 EFECTUAR PAGO</h3>
                <p className="text-xs font-bold uppercase mt-1">
                  Transacción total:{' '}
                  {getAppliedDiscount() > 0 ? (
                    <span>
                      <span className="line-through text-zinc-700 mr-2">${formatNum(total)}</span>
                      <strong className="bg-black text-lime-400 px-1.5 py-0.5 rounded font-retro-mono font-bold">
                        ${formatNum(Math.max(0, total - getAppliedDiscount()))} USD
                      </strong>
                    </span>
                  ) : (
                    <strong className="bg-black text-lime-400 px-1.5 py-0.5 rounded font-retro-mono font-bold">
                      ${formatNum(total)} USD
                    </strong>
                  )}
                </p>
              </div>

              <div className="p-5 space-y-5 bg-pink-50 overflow-y-auto max-h-[60vh]">
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
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setConsumidorFinal();
                        }}
                        className="bg-cyan-200 hover:bg-cyan-300 border-2 border-black rounded text-[9px] font-black px-2 py-0.5 cursor-pointer uppercase transition-all shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5"
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
                        className={`w-full px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${
                          !isConsumidorFinal && !isNameValid
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
                            className={`flex-1 min-w-0 px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${
                              !isConsumidorFinal && !isDocValid
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
                                  <span className={`inline-block text-[8px] font-black px-1.5 py-0.2 rounded border uppercase ${
                                    val.valido 
                                      ? 'bg-emerald-200 text-emerald-900 border-emerald-400' 
                                      : 'bg-rose-200 text-rose-950 border-rose-400'
                                  }`}>
                                    {val.valido ? 'Válido' : 'Inválido'}
                                  </span>
                                  <span className={`text-[8.5px] font-bold uppercase leading-tight ${
                                    val.valido ? 'text-emerald-700' : 'text-rose-700'
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
                          className={`w-full px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${
                            !isConsumidorFinal && !isPhoneValid
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
                          className={`w-full px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${
                            !isConsumidorFinal && !isAddressValid
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
                          className={`w-full px-2.5 py-1.5 border-2 rounded text-xs font-bold text-black focus:outline-none transition-all ${
                            !isConsumidorFinal && !isEmailValid
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

                {/* SAVE CUSTOMER BUTTON */}
                {!isConsumidorFinal && customerName.trim().length > 0 && customerDocumentId.trim().length > 0 && onSaveCustomer && (
                  <div className="flex justify-end">
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
                      className="flex items-center gap-1.5 bg-lime-200 hover:bg-lime-300 border-2 border-black text-black font-black text-[10px] uppercase px-3.5 py-2 rounded-lg shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 transition-all cursor-pointer"
                    >
                      💾 GUARDAR CLIENTE EN DIRECTORIO
                    </button>
                  </div>
                )}

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
                        className={`p-3.5 border-3 border-black rounded-lg text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${
                          isSelected
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
                          onClick={() => setCashReceived((Math.max(0, total - getAppliedDiscount())).toFixed(2))}
                          className="bg-yellow-100 hover:bg-yellow-200 border-2 border-black rounded text-[10px] font-black px-2.5 py-1.5 cursor-pointer uppercase transition-all shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5"
                        >
                          Exacto
                        </button>
                        {[5, 10, 20, 50, 100].map((bill) => {
                          // Only highlight/enable bill shortcuts that are >= finalTotal
                          const finalTotal = Math.max(0, total - getAppliedDiscount());
                          const isSuggested = bill >= finalTotal;
                          return (
                            <button
                              key={bill}
                              type="button"
                              onClick={() => setCashReceived(bill.toFixed(2))}
                              className={`border-2 border-black rounded text-[10px] font-retro-mono font-black px-2.5 py-1.5 cursor-pointer transition-all shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5 ${
                                isSuggested
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

              <div className="bg-pink-100 border-t-3 border-black p-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="bg-white hover:bg-zinc-100 text-black border-2 border-black rounded-lg px-4.5 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    (paymentMethod === 'efectivo' && (parseNum(cashReceived) || 0) < Math.max(0, total - getAppliedDiscount())) ||
                    (paymentMethod === 'transferencia' && !transferNumber.trim()) ||
                    !isCustomerDataValid ||
                    getCartStockStatus().hasAgotados
                  }
                  className={`px-5 py-2.5 rounded-lg text-xs font-black border-2 border-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all cursor-pointer ${
                    ((paymentMethod === 'efectivo' && (parseNum(cashReceived) || 0) < Math.max(0, total - getAppliedDiscount())) ||
                    (paymentMethod === 'transferencia' && !transferNumber.trim()) ||
                    !isCustomerDataValid ||
                    getCartStockStatus().hasAgotados)
                      ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed border-zinc-400 shadow-none'
                      : 'bg-lime-300 hover:bg-lime-400'
                  }`}
                  title={
                    getCartStockStatus().hasAgotados
                      ? "Hay insumos en 0 en esta orden. No se puede cobrar."
                      : !isCustomerDataValid
                        ? "Complete todos los campos del cliente para emitir nota con datos"
                        : (paymentMethod === 'efectivo' && (parseNum(cashReceived) || 0) < Math.max(0, total - getAppliedDiscount()))
                          ? "Ingrese el efectivo entregado suficiente"
                          : (paymentMethod === 'transferencia' && !transferNumber.trim())
                            ? "Ingrese el número de transferencia"
                            : "Registrar Venta"
                  }
                >
                  REGISTRAR VENTA
                </button>
              </div>
            </form>
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
                <h4 className="text-sm font-black uppercase tracking-widest pt-2">{businessName || 'Cafetería Espresso'}</h4>
                <p className="text-[10px] text-zinc-600 font-extrabold">RUC: 1725403883001</p>
                <p className="text-[10px] text-zinc-600 font-bold uppercase">GUAMANÍ - VICTORIA CENTRAL / PEDRO VICENTE MALDONADO ESQ S59D / S59-190 / S59D</p>
                <div className="py-1">
                  <p className="text-[9px] text-black font-black uppercase tracking-wider border-y-2 border-dashed border-black/40 py-1">*** BOLETA DE CONSUMO RETRO ***</p>
                </div>
              </div>

              <div className="space-y-1 text-[10px] text-black font-bold border-b-2 border-dashed border-black/40 pb-3">
                <div className="flex justify-between">
                  <span>NOTA DE VENTA:</span>
                  <span className="font-black text-xs bg-yellow-100 border border-black px-1 rounded">{recentSaleTicket.invoiceNumber || recentSaleTicket.id}</span>
                </div>
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
                {recentSaleTicket.discount && recentSaleTicket.discount > 0 ? (
                  <>
                    <div className="flex justify-between">
                      <span>Subtotal Original:</span>
                      <span>${formatNum(recentSaleTicket.subtotal || (recentSaleTicket.total + recentSaleTicket.discount))}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>Descuento:</span>
                      <span>-${formatNum(recentSaleTicket.discount)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>${formatNum(recentSaleTicket.total / (1 + taxRate))}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>IVA (0%):</span>
                  <span>${formatNum(recentSaleTicket.total - (recentSaleTicket.total / (1 + taxRate)))}</span>
                </div>
                <div className="flex justify-between font-black text-sm text-black pt-2 border-t-2 border-dashed border-black/40 bg-yellow-100 p-1 rounded">
                  <span className="uppercase text-[10px]">TOTAL NETO:</span>
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

            {/* Print action simulation */}
            <div className="bg-pink-100 border-t-3 border-black p-4 flex gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 border-2 border-black bg-white hover:bg-zinc-100 rounded-lg py-2.5 text-xs font-black uppercase tracking-wider text-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
              >
                <Printer className="w-4 h-4 stroke-[2.5]" />
                IMPRIMIR
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
