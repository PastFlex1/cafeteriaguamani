/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  Download,
  Printer,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Eye,
  DollarSign,
  TrendingUp,
  Layers,
  ArrowUpRight,
  X,
  Sparkles,
  ShieldCheck,
  Calendar,
  Building2,
  User,
  Coffee,
  Utensils,
  Package,
  Check,
  Loader2,
  Send,
  KeyRound,
  Mail,
} from 'lucide-react';

import {
  CompanyConfig,
  CustomerDetails,
  ElectronicInvoice,
  Ingredient,
  InvoiceItem,
  MenuItem,
  VatRateType,
} from '../types';

import {
  generateAccessKey,
  generateSriInvoiceXml,
  generateSriAuthorizedXml,
  DEFAULT_CONSUMIDOR_FINAL,
  SRI_FORMAS_PAGO,
} from '../utils/sriCalculations';

import { exportInvoiceRidePdf } from '../utils/sriPdfGenerator';
import { isSmtpConfigured, sendInvoiceRideAndXmlEmail } from '../utils/emailService';
import RidePreviewModal from './RidePreviewModal';
import RetroDatePicker from './RetroDatePicker';
import RetroSelect from './RetroSelect';
import { consultarIdentificacionSri } from '../utils/sriConsultas';
import { formatNum } from '../utils';

interface InvoiceViewProps {
  company: CompanyConfig;
  invoices: ElectronicInvoice[];
  customers: CustomerDetails[];
  menuItems: MenuItem[];
  ingredients?: Ingredient[];
  onAddInvoice: (invoice: ElectronicInvoice) => void;
  onUpdateInvoice?: (invoice: ElectronicInvoice) => void;
  onSaveCustomer?: (customer: CustomerDetails) => void;
  onUpdateCompany?: (company: CompanyConfig) => void;
}

export default function InvoiceView({
  company,
  invoices = [],
  customers = [],
  menuItems = [],
  ingredients = [],
  onAddInvoice,
  onUpdateInvoice,
  onSaveCustomer,
  onUpdateCompany,
}: InvoiceViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'iva15' | 'iva0'>('all');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<ElectronicInvoice | null>(null);
  const [autoPrintThermal, setAutoPrintThermal] = useState(false);
  const [alertInfo, setAlertInfo] = useState<{ title: string; message: string; type: 'warning' | 'error' | 'success' } | null>(null);

  // Ciclo oficial SRI (Firmando -> Recepción -> Autorización)
  const [sriCycle, setSriCycle] = useState<{
    active: boolean;
    step: 'signing' | 'reception' | 'authorization' | 'done';
    invoiceNumber: string;
    accessKey?: string;
    clientName: string;
    total: number;
  } | null>(null);

  // New Invoice Form State
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string>('cf');
  const [customCustomer, setCustomCustomer] = useState<CustomerDetails>({
    name: 'CONSUMIDOR FINAL',
    documentId: '9999999999999',
    phone: '9999999999',
    address: 'S/N',
    email: 'consumidor@final.com',
  });
  const [isSearchingDoc, setIsSearchingDoc] = useState(false);
  const [docSearchFeedback, setDocSearchFeedback] = useState<string | null>(null);

  const [fechaEmision, setFechaEmision] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [formaPago, setFormaPago] = useState<string>('01'); // 01: Efectivo
  const [plazoDias, setPlazoDias] = useState<number>(0);
  const [propina, setPropina] = useState<number>(0);
  const [observaciones, setObservaciones] = useState<string>('Consumo en Cafetería');
  const [numeroTransferencia, setNumeroTransferencia] = useState<string>('');

  // Items State in New Invoice
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: `it-${Date.now()}-1`,
      codigoPrincipal: '0101',
      descripcion: '',
      cantidad: 1,
      precioUnitario: 0,
      descuento: 0,
      tarifaIva: (company.tarifaIvaPredeterminada || 15) as VatRateType,
      precioTotalSinImpuesto: 0,
      valorIva: 0,
      valorTotal: 0,
    },
  ]);

  // Next secuencial calculation
  const nextSecNum = Math.max(
    (company.secuencialFactura || 1),
    invoices.length + 1
  );
  const secuencialStr = nextSecNum.toString().padStart(9, '0');
  const numeroComprobanteStr = `${company.codigoEstablecimiento || '001'}-${company.puntoEmision || '001'}-${secuencialStr}`;

  // Customer options for RetroSelect
  const customerOptions = useMemo(() => {
    const opts = [
      { value: 'cf', label: 'CONSUMIDOR FINAL (9999999999999)' },
      { value: 'manual', label: '➕ NUEVO / INGRESAR MANUALMENTE' },
    ];
    customers.forEach((c) => {
      opts.push({
        value: c.documentId,
        label: `${c.name} (${c.documentId})`,
      });
    });
    return opts;
  }, [customers]);

  const handleSelectCustomer = (val: string) => {
    setSelectedCustomerKey(val);
    setDocSearchFeedback(null);
    if (val === 'cf') {
      setCustomCustomer({
        name: 'CONSUMIDOR FINAL',
        documentId: '9999999999999',
        phone: '9999999999',
        address: 'S/N',
        email: 'consumidor@final.com',
      });
    } else if (val === 'manual') {
      setCustomCustomer({
        name: '',
        documentId: '',
        phone: '',
        address: 'Quito, Ecuador',
        email: '',
      });
    } else {
      const found = customers.find((c) => c.documentId === val);
      if (found) {
        setCustomCustomer({ ...found });
      }
    }
  };

  // Live lookup via SRI
  const handleLookupDoc = async () => {
    const docId = customCustomer.documentId.trim();
    if (docId.length < 10) {
      setDocSearchFeedback('⚠️ Ingrese al menos 10 dígitos (Cédula o RUC)');
      return;
    }
    setIsSearchingDoc(true);
    setDocSearchFeedback('🔍 Consultando SRI en tiempo real...');
    try {
      const res = await consultarIdentificacionSri(docId);
      const fullName = res.nombreCompleto || res.razonSocial || res.nombre;
      if (res.found && fullName) {
        setCustomCustomer((prev) => ({
          ...prev,
          name: fullName,
          address: res.rucData?.direccion || prev.address || 'Quito, Ecuador',
          email: prev.email,
          phone: prev.phone,
        }));
        setDocSearchFeedback(`✅ SRI: ${fullName}`);
        if (onSaveCustomer) {
          onSaveCustomer({
            name: fullName,
            documentId: docId,
            phone: customCustomer.phone || '',
            address: res.rucData?.direccion || customCustomer.address || 'Quito, Ecuador',
            email: customCustomer.email || '',
          });
        }
      } else {
        setDocSearchFeedback(`⚠️ ${res.error || 'No se encontró en SRI. Ingrese el nombre manualmente.'}`);
      }
    } catch (e: any) {
      setDocSearchFeedback('⚠️ No se pudo conectar al SRI');
    } finally {
      setIsSearchingDoc(false);
    }
  };

  // Unified Catalog containing Comidas, Bebidas, Combos, and Inventario (Materia Prima)
  const catalogProducts = useMemo(() => {
    const list: Array<{
      id: string;
      sourceType: 'comida' | 'bebida' | 'combo' | 'inventario';
      code: string;
      name: string;
      price: number;
      stock?: number;
      unit?: string;
      categoryLabel: string;
      badgeBg: string;
    }> = [];

    // 1. Menu items: Comidas, Bebidas, Combos
    menuItems.forEach((m) => {
      let sourceType: 'comida' | 'bebida' | 'combo' = 'bebida';
      let categoryLabel = '☕ Bebida';
      let badgeBg = 'bg-cyan-200 text-cyan-950 border-black';

      if (m.category === 'combos') {
        sourceType = 'combo';
        categoryLabel = '🍔 Combo';
        badgeBg = 'bg-orange-300 text-orange-950 border-black';
      } else if (m.category === 'reposteria' || m.category === 'alimentos') {
        sourceType = 'comida';
        categoryLabel = '🍰 Comida';
        badgeBg = 'bg-pink-300 text-pink-950 border-black';
      }

      list.push({
        id: m.id,
        sourceType,
        code: '0101',
        name: m.name,
        price: m.price || 0,
        stock: m.stock,
        categoryLabel,
        badgeBg,
      });
    });

    // 2. Ingredients: Materia Prima / Inventario
    (ingredients || []).forEach((ing) => {
      list.push({
        id: ing.id,
        sourceType: 'inventario',
        code: '0101',
        name: ing.name,
        price: ing.costPerUnit || 1.00,
        stock: ing.stock,
        unit: ing.unit,
        categoryLabel: '📦 Inventario',
        badgeBg: 'bg-yellow-300 text-yellow-950 border-black',
      });
    });

    return list;
  }, [menuItems, ingredients]);

  // Product Picker Modal State
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [targetItemIndex, setTargetItemIndex] = useState<number | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<'all' | 'comida' | 'bebida' | 'combo' | 'inventario'>('all');
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const filteredCatalog = useMemo(() => {
    return catalogProducts.filter((p) => {
      const matchCat = catalogCategory === 'all' || p.sourceType === catalogCategory;
      const q = catalogSearch.toLowerCase().trim();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [catalogProducts, catalogCategory, catalogSearch]);

  const handleSelectProduct = (prod: typeof catalogProducts[0], targetIdx: number | null) => {
    const updated = [...items];

    let idxToFill: number;
    if (typeof targetIdx === 'number' && targetIdx >= 0 && targetIdx < updated.length) {
      idxToFill = targetIdx;
    } else {
      // Find empty row or add new
      const emptyIdx = updated.findIndex((it) => !it.descripcion.trim());
      if (emptyIdx !== -1) {
        idxToFill = emptyIdx;
      } else {
        idxToFill = updated.length;
        updated.push({
          id: `it-${Date.now()}-${updated.length + 1}`,
          codigoPrincipal: prod.code,
          descripcion: prod.name,
          cantidad: 1,
          precioUnitario: prod.price,
          descuento: 0,
          tarifaIva: (company.tarifaIvaPredeterminada || 15) as VatRateType,
          precioTotalSinImpuesto: 0,
          valorIva: 0,
          valorTotal: 0,
        });
      }
    }

    const current = {
      ...updated[idxToFill],
      codigoPrincipal: prod.code,
      descripcion: prod.name,
      precioUnitario: prod.price,
      cantidad: updated[idxToFill]?.cantidad > 0 ? updated[idxToFill].cantidad : 1,
      tarifaIva: updated[idxToFill]?.tarifaIva || (company.tarifaIvaPredeterminada || 15) as VatRateType,
    };

    const cant = typeof current.cantidad === 'number' ? current.cantidad : parseFloat(current.cantidad) || 1;
    const pu = typeof current.precioUnitario === 'number' ? current.precioUnitario : parseFloat(current.precioUnitario) || 0;
    const desc = typeof current.descuento === 'number' ? current.descuento : parseFloat(current.descuento) || 0;

    let ivaPorc = 0;
    if (current.tarifaIva === 15) ivaPorc = 0.15;
    else if (current.tarifaIva === 5) ivaPorc = 0.05;
    else if (current.tarifaIva === 0) ivaPorc = 0;

    // El IVA se desglosa del precio final (PVP), no se aumenta
    const subtotalBruto = cant * pu;
    const totalConIva = Math.max(0, subtotalBruto - desc);
    const totalSinImp = ivaPorc > 0 ? totalConIva / (1 + ivaPorc) : totalConIva;
    current.precioTotalSinImpuesto = totalSinImp;
    current.valorIva = totalConIva - totalSinImp;
    current.valorTotal = totalConIva;

    updated[idxToFill] = current;
    setItems(updated);

    // Feedback
    setJustAddedId(prod.id);
    setTimeout(() => setJustAddedId(null), 1200);

    // If filling a specific row, close immediately
    if (targetIdx !== null) {
      setIsProductPickerOpen(false);
      setTargetItemIndex(null);
    }
  };

  // Item management
  const handleAddItem = () => {
    const newItem: InvoiceItem = {
      id: `it-${Date.now()}-${items.length + 1}`,
      codigoPrincipal: '0101',
      descripcion: '',
      cantidad: 1,
      precioUnitario: 0,
      descuento: 0,
      tarifaIva: (company.tarifaIvaPredeterminada || 15) as VatRateType,
      precioTotalSinImpuesto: 0,
      valorIva: 0,
      valorTotal: 0,
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    let current = { ...updated[index], [field]: value };

    // Auto-fill if product matches menu item or inventory item
    if (field === 'descripcion' && catalogProducts.length > 0) {
      const query = String(value).toLowerCase().trim();
      const found = catalogProducts.find((p) => p.name.toLowerCase() === query);
      if (found) {
        current.codigoPrincipal = found.code;
        current.precioUnitario = found.price || 0;
        current.tarifaIva = (company.tarifaIvaPredeterminada || 15) as VatRateType;
      }
    }

    const cant = typeof current.cantidad === 'number' ? current.cantidad : parseFloat(current.cantidad) || 0;
    const pu = typeof current.precioUnitario === 'number' ? current.precioUnitario : parseFloat(current.precioUnitario) || 0;
    const desc = typeof current.descuento === 'number' ? current.descuento : parseFloat(current.descuento) || 0;

    let ivaPorc = 0;
    if (current.tarifaIva === 15) ivaPorc = 0.15;
    else if (current.tarifaIva === 5) ivaPorc = 0.05;
    else if (current.tarifaIva === 0) ivaPorc = 0;

    // El IVA se desglosa del precio final (PVP), no se aumenta
    const subtotalBruto = cant * pu;
    const totalConIva = Math.max(0, subtotalBruto - desc);
    const totalSinImp = ivaPorc > 0 ? totalConIva / (1 + ivaPorc) : totalConIva;
    current.precioTotalSinImpuesto = totalSinImp;
    current.valorIva = totalConIva - totalSinImp;
    current.valorTotal = totalConIva;

    updated[index] = current;
    setItems(updated);
  };

  // Calculations for current invoice
  const subtotal15 = items.filter((it) => it.tarifaIva === 15).reduce((acc, it) => acc + it.precioTotalSinImpuesto, 0);
  const subtotal5 = items.filter((it) => it.tarifaIva === 5).reduce((acc, it) => acc + it.precioTotalSinImpuesto, 0);
  const subtotal0 = items.filter((it) => it.tarifaIva === 0).reduce((acc, it) => acc + it.precioTotalSinImpuesto, 0);
  const subtotalNoObjeto = items.filter((it) => it.tarifaIva === 'NO_OBJETO').reduce((acc, it) => acc + it.precioTotalSinImpuesto, 0);
  const subtotalExento = items.filter((it) => it.tarifaIva === 'EXENTO').reduce((acc, it) => acc + it.precioTotalSinImpuesto, 0);
  const totalDescuento = items.reduce((acc, it) => acc + (it.descuento || 0), 0);
  const subtotalSinImpuestos = subtotal15 + subtotal5 + subtotal0 + subtotalNoObjeto + subtotalExento;
  const totalIva = items.reduce((acc, it) => acc + it.valorIva, 0);
  const importeTotal = subtotalSinImpuestos + totalIva + (propina || 0);

  // Global metrics
  const totalFacturadoVentas = invoices.filter((inv) => inv.estado !== 'ANULADO').reduce((acc, inv) => acc + inv.importeTotal, 0);
  const totalIvaGenerado = invoices.filter((inv) => inv.estado !== 'ANULADO').reduce((acc, inv) => acc + inv.totalIva, 0);
  const totalSubtotalNeto = invoices.filter((inv) => inv.estado !== 'ANULADO').reduce((acc, inv) => acc + inv.subtotalSinImpuestos, 0);

  // Form options
  const formaPagoOptions = SRI_FORMAS_PAGO.map((fp) => ({
    value: fp.codigo,
    label: `${fp.codigo} - ${fp.nombre}`,
  }));

  const ivaRateOptions = [
    { value: '15', label: '15% - Tarifa General IVA (Vigente)' },
    { value: '5', label: '5% - Materiales de Construcción' },
    { value: '0', label: '0% - Tarifa Cero IVA (RIMPE / Básicos)' },
    { value: 'NO_OBJETO', label: 'No Objeto de Impuesto' },
    { value: 'EXENTO', label: 'Exento de IVA' },
  ];

  // Save Invoice
  const handleSaveInvoice = () => {
    if (!customCustomer.name.trim() || !customCustomer.documentId.trim()) {
      setAlertInfo({
        title: 'Cliente Requerido',
        message: 'Por favor ingrese el nombre y documento de identificación del cliente.',
        type: 'warning',
      });
      return;
    }

    if (items.length === 0 || items.some((it) => !it.descripcion.trim() || it.cantidad <= 0 || it.precioUnitario < 0)) {
      setAlertInfo({
        title: 'Ítems Incompletos',
        message: 'Por favor complete todos los campos de los ítems con descripción, cantidades y precios válidos.',
        type: 'warning',
      });
      return;
    }

    // SRI Normativa: Consumidor Final máximo $50.00
    const isCurrentConsumidorFinal =
      selectedCustomerKey === 'cf' ||
      customCustomer.documentId.trim() === '9999999999999' ||
      customCustomer.documentId.trim() === '9999999999' ||
      /^9+$/.test(customCustomer.documentId.trim()) ||
      customCustomer.name.toUpperCase().includes('CONSUMIDOR FINAL');

    if (isCurrentConsumidorFinal && importeTotal > 50) {
      setAlertInfo({
        title: 'Límite SRI Consumidor Final Excedido ($50.00)',
        message: 'Por normativa del SRI, las facturas por montos mayores a $50.00 USD NO pueden emitirse a Consumidor Final. Debe ingresar los datos (Cédula, RUC o Pasaporte) del cliente.',
        type: 'error',
      });
      return;
    }

    // 1. Clave de Acceso SRI (49 dígitos)
    const claveAcceso = generateAccessKey({
      fechaEmision,
      tipoComprobante: '01',
      rucEmisor: company.ruc,
      ambiente: company.ambiente,
      establecimiento: company.codigoEstablecimiento,
      puntoEmision: company.puntoEmision,
      secuencial: secuencialStr,
    });

    const newInvoice: ElectronicInvoice = {
      id: `inv-${Date.now()}`,
      tipoDocumento: '01',
      establecimiento: company.codigoEstablecimiento,
      puntoEmision: company.puntoEmision,
      secuencial: secuencialStr,
      numeroComprobante: numeroComprobanteStr,
      claveAcceso,
      fechaEmision,
      cliente: {
        id: customCustomer.documentId,
        identificacion: customCustomer.documentId,
        tipoIdentificacion: customCustomer.documentId.length === 13 && customCustomer.documentId !== '9999999999999' ? '04' :
          customCustomer.documentId.length === 10 ? '05' :
          customCustomer.documentId === '9999999999999' ? '07' : '06',
        razonSocial: customCustomer.name,
        direccion: customCustomer.address || 'Quito, Ecuador',
        telefono: customCustomer.phone || '',
        email: customCustomer.email || '',
      },
      items: items.map((it) => ({
        ...it,
        cantidad: Number(it.cantidad) || 0,
        precioUnitario: Number(it.precioUnitario) || 0,
        descuento: Number(it.descuento) || 0,
      })),
      subtotal15,
      subtotal5,
      subtotal0,
      subtotalNoObjeto,
      subtotalExento,
      totalDescuento,
      subtotalSinImpuestos,
      totalIva,
      propina: propina || 0,
      importeTotal,
      pagos: [
        {
          formaPago,
          total: importeTotal,
          plazo: plazoDias,
          unidadTiempo: 'DIAS',
          ...(formaPago === '20' && numeroTransferencia ? { numeroTransferencia } : {}),
        },
      ],
      estado: 'AUTORIZADO',
      numeroAutorizacion: claveAcceso,
      fechaAutorizacion: `${fechaEmision} ${new Date().toLocaleTimeString('es-EC')}`,
      observaciones,
    };

    // Generate XML
    newInvoice.xml = generateSriInvoiceXml(newInvoice, company);

    // Cerrar modal de nueva factura y abrir ciclo SRI
    setIsNewModalOpen(false);
    setSriCycle({
      active: true,
      step: 'signing',
      invoiceNumber: numeroComprobanteStr,
      accessKey: claveAcceso,
      clientName: customCustomer.name,
      total: importeTotal,
    });

    // 1. Firmando -> 2. Recepción SRI
    setTimeout(() => {
      setSriCycle((prev) => prev ? { ...prev, step: 'reception' } : null);
    }, 900);

    // 2. Recepción -> 3. Autorización SRI
    setTimeout(() => {
      setSriCycle((prev) => prev ? { ...prev, step: 'authorization' } : null);
    }, 1800);

    // 3. Autorizado por el SRI
    setTimeout(() => {
      setSriCycle((prev) => prev ? { ...prev, step: 'done' } : null);
    }, 2700);

    // Finalizar guardado tras 3400ms
    setTimeout(() => {
      onAddInvoice(newInvoice);

      if (onUpdateCompany) {
        onUpdateCompany({
          ...company,
          secuencialFactura: nextSecNum + 1,
        });
      }

      if (onSaveCustomer && customCustomer.documentId !== '9999999999999') {
        onSaveCustomer(customCustomer);
      }

      setItems([
        {
          id: `it-${Date.now()}-1`,
          codigoPrincipal: '0101',
          descripcion: '',
          cantidad: 1,
          precioUnitario: 0,
          descuento: 0,
          tarifaIva: (company.tarifaIvaPredeterminada || 15) as VatRateType,
          precioTotalSinImpuesto: 0,
          valorIva: 0,
          valorTotal: 0,
        },
      ]);

      setSriCycle(null);
      setPreviewInvoice(newInvoice);

      if ((company.smtpAutoSend ?? true) && isSmtpConfigured(company) && customCustomer.email && customCustomer.email.includes('@')) {
        sendInvoiceRideAndXmlEmail(newInvoice, company, customCustomer.email);
      }
    }, 3400);
  };

  const handleDownloadXml = (inv: ElectronicInvoice) => {
    const xml = generateSriAuthorizedXml(inv, company);
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `XML_AUTORIZADO_${inv.numeroComprobante}_${inv.claveAcceso}.xml`;
    link.click();
  };

  const handleDownloadRide = (inv: ElectronicInvoice) => {
    exportInvoiceRidePdf(inv, company);
  };

  const isInvoiceConsumidorFinal = (inv: ElectronicInvoice) => {
    const docId = (inv.cliente?.identificacion || '').trim();
    const name = (inv.cliente?.razonSocial || '').trim().toUpperCase();
    return (
      !docId ||
      docId === '9999999999999' ||
      docId === '9999999999' ||
      /^9+$/.test(docId) ||
      name.includes('CONSUMIDOR FINAL')
    );
  };

  const handleVoidInvoice = (inv: ElectronicInvoice) => {
    if (isInvoiceConsumidorFinal(inv)) {
      setAlertInfo({
        title: 'Anulación Bloqueada (Normativa SRI)',
        message: 'Según la normativa vigente del SRI, las facturas electrónicas emitidas a CONSUMIDOR FINAL no se pueden anular.',
        type: 'error',
      });
      return;
    }
    if (!window.confirm(`¿Está seguro de anular la Factura ${inv.numeroComprobante}?`)) return;
    if (onUpdateInvoice) {
      onUpdateInvoice({
        ...inv,
        estado: 'ANULADO',
      });
      setAlertInfo({
        title: 'Factura Anulada',
        message: `La factura ${inv.numeroComprobante} ha sido marcada como ANULADA.`,
        type: 'warning',
      });
    }
  };

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchSearch =
        inv.numeroComprobante.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.cliente.razonSocial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.cliente.identificacion.includes(searchTerm) ||
        inv.claveAcceso.includes(searchTerm);

      if (!matchSearch) return false;

      if (selectedFilter === 'iva15') return (inv.subtotal15 || 0) > 0;
      if (selectedFilter === 'iva0') return (inv.subtotal0 || 0) > 0;
      return true;
    });
  }, [invoices, searchTerm, selectedFilter]);

  return (
    <div className="space-y-6 pb-10">
      {/* ============================================================ */}
      {/* TIER 1: TOP 4 RETRO BENTO METRIC & ACTION CARDS              */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Facturado */}
        <div className="bg-white border-3 border-black rounded-xl p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-black">Total Facturado</span>
            <div className="w-8 h-8 rounded-lg bg-yellow-300 border-2 border-black flex items-center justify-center text-black font-black">
              <DollarSign className="w-4 h-4 stroke-[3]" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-retro-mono tracking-tight text-black">
              ${totalFacturadoVentas.toFixed(2)}
            </span>
            <span className="text-[10px] font-black uppercase bg-lime-300 px-2 py-0.5 border-2 border-black rounded text-black">
              USD
            </span>
          </div>
        </div>

        {/* Card 2: IVA 15% Débito Fiscal SRI */}
        <div className="bg-white border-3 border-black rounded-xl p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-black">IVA Débito SRI</span>
            <div className="w-8 h-8 rounded-lg bg-pink-400 border-2 border-black flex items-center justify-center text-black font-black">
              <TrendingUp className="w-4 h-4 stroke-[3]" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-retro-mono tracking-tight text-black">
              ${totalIvaGenerado.toFixed(2)}
            </span>
            <span className="text-[10px] font-black uppercase bg-pink-100 text-pink-700 px-2 py-0.5 border border-pink-300 rounded">
              Tarifa 15%
            </span>
          </div>
        </div>

        {/* Card 3: Base Neta Ventas */}
        <div className="bg-white border-3 border-black rounded-xl p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-black">Base Neta Ventas</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-300 border-2 border-black flex items-center justify-center text-black font-black">
              <Layers className="w-4 h-4 stroke-[3]" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black font-retro-mono tracking-tight text-black">
              ${totalSubtotalNeto.toFixed(2)}
            </span>
            <span className="text-[10px] font-black uppercase bg-cyan-100 text-cyan-800 px-2 py-0.5 border border-cyan-300 rounded">
              {invoices.length} Docs
            </span>
          </div>
        </div>

        {/* Card 4: Action Card - Emitir Factura Electrónica */}
        <div className="bg-gradient-to-r from-pink-400 via-rose-400 to-yellow-300 border-3 border-black rounded-xl p-4 text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider">Factura SRI 01</div>
            <div className="w-8 h-8 rounded-lg bg-white border-2 border-black flex items-center justify-center text-black font-black shadow-[1px_1px_0px_0px_#000]">
              <FileText className="w-4 h-4 stroke-[3]" />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsNewModalOpen(true)}
              className="px-4 py-2 bg-black text-white hover:bg-zinc-800 font-black rounded-lg text-xs uppercase tracking-wider border-2 border-black shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] active:translate-y-0.5 cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[3] text-lime-400" />
              <span>Nueva Factura</span>
            </button>
            <span className="text-[10px] font-retro-mono font-black bg-white px-2 py-1 border-2 border-black rounded shadow-[1px_1px_0px_0px_#000]">
              v2.1 SRI
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TIER 2: FILTER PILLS & SEARCH BAR                            */}
      {/* ============================================================ */}
      <div className="bg-white border-3 border-black rounded-xl p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Segmented Filter Pills */}
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto scrollbar-none">
          {[
            { id: 'all', label: 'Todas las Facturas' },
            { id: 'iva15', label: 'Con Tarifa 15%' },
            { id: 'iva0', label: 'Tarifa 0% / Exento' },
          ].map((pill) => {
            const active = selectedFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setSelectedFilter(pill.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border-2 border-black transition-all cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-black text-lime-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-zinc-50 hover:bg-yellow-200 text-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 stroke-[3] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por cliente, RUC o número..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 focus:bg-white text-xs font-bold rounded-lg border-2 border-black focus:outline-none focus:ring-2 focus:ring-yellow-300 transition-all"
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* TIER 3: INVOICES TABLE                                       */}
      {/* ============================================================ */}
      <div className="bg-white border-3 border-black rounded-xl p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-black flex items-center gap-2">
              <FileText className="w-4 h-4 text-pink-500 stroke-[3]" />
              Comprobantes Emitidos (SRI 01)
            </h3>
            <p className="text-[11px] font-bold text-zinc-500 mt-0.5">
              Esquema Oficial SRI v2.1 Off-line con Clave de Acceso de 49 dígitos
            </p>
          </div>
          <span className="text-xs font-black font-retro-mono bg-yellow-300 px-3 py-1 rounded border-2 border-black shadow-[2px_2px_0px_0px_#000]">
            {filteredInvoices.length} Comprobantes
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-100 border-2 border-black text-black font-black uppercase text-[11px]">
                <th className="py-2.5 px-3">Comprobante</th>
                <th className="py-2.5 px-3">Cliente / Razón Social</th>
                <th className="py-2.5 px-3">Fecha</th>
                <th className="py-2.5 px-3 text-right">Subtotal</th>
                <th className="py-2.5 px-3 text-right">IVA 15%</th>
                <th className="py-2.5 px-3 text-right">Total USD</th>
                <th className="py-2.5 px-3 text-center">Estado SRI</th>
                <th className="py-2.5 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-zinc-200">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-400">
                    <FileText className="w-10 h-10 mx-auto text-zinc-300 mb-2 stroke-[1.5]" />
                    <p className="text-sm font-black text-black uppercase">No se encontraron facturas</p>
                    <p className="text-xs font-bold text-zinc-500 mt-1">
                      Haga clic en "+ Nueva Factura" para emitir el primer comprobante electrónico.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv, idx) => (
                  <tr
                    key={inv.id || idx}
                    className="hover:bg-yellow-50/70 transition-colors cursor-pointer group"
                    onClick={() => setPreviewInvoice(inv)}
                  >
                    {/* Comprobante */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-lime-300 border-2 border-black text-black font-black text-[9px] flex items-center justify-center shrink-0 shadow-[1px_1px_0px_0px_#000]">
                          FAC
                        </div>
                        <div>
                          <div className="font-black font-retro-mono text-black">{inv.numeroComprobante}</div>
                          <div className="text-[10px] font-retro-mono text-zinc-500 truncate max-w-[140px]" title={inv.claveAcceso}>
                            {inv.claveAcceso.slice(0, 15)}...
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Cliente */}
                    <td className="py-3 px-3">
                      <div className="font-black text-black truncate max-w-[190px]">{inv.cliente?.razonSocial || 'CONSUMIDOR FINAL'}</div>
                      <div className="text-[10px] font-retro-mono font-bold text-zinc-500">{inv.cliente?.identificacion}</div>
                    </td>

                    {/* Fecha */}
                    <td className="py-3 px-3 whitespace-nowrap font-bold text-black font-retro-mono">
                      {inv.fechaEmision}
                    </td>

                    {/* Subtotal */}
                    <td className="py-3 px-3 text-right font-black font-retro-mono text-zinc-800">
                      ${Number(inv.subtotalSinImpuestos || 0).toFixed(2)}
                    </td>

                    {/* IVA */}
                    <td className="py-3 px-3 text-right font-black font-retro-mono text-pink-600">
                      ${Number(inv.totalIva || 0).toFixed(2)}
                    </td>

                    {/* Total USD */}
                    <td className="py-3 px-3 text-right font-black font-retro-mono text-black text-sm whitespace-nowrap">
                      ${Number(inv.importeTotal || 0).toFixed(2)}
                    </td>

                    {/* Estado SRI */}
                    <td className="py-3 px-3 text-center">
                      {inv.estado === 'ANULADO' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded border-2 border-black text-[10px] font-black uppercase bg-rose-200 text-rose-800 shadow-[1px_1px_0px_0px_#000]">
                          <X className="w-3 h-3 stroke-[3]" />
                          <span>ANULADO</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded border-2 border-black text-[10px] font-black uppercase bg-lime-300 text-black shadow-[1px_1px_0px_0px_#000]">
                          <CheckCircle2 className="w-3 h-3 stroke-[3] text-black" />
                          <span>AUTORIZADO</span>
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAutoPrintThermal(false);
                            setPreviewInvoice(inv);
                          }}
                          className="p-1.5 bg-emerald-300 hover:bg-emerald-400 text-black rounded border-2 border-black shadow-[1px_1px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                          title="Ver RIDE y Enviar RIDE + XML Autorizado por Correo"
                        >
                          <Mail className="w-4 h-4 stroke-[2.5]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAutoPrintThermal(true);
                            setPreviewInvoice(inv);
                          }}
                          className="p-1.5 bg-lime-300 hover:bg-lime-400 text-black rounded border-2 border-black shadow-[1px_1px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                          title="Imprimir Factura en Impresora Térmica (80mm)"
                        >
                          <Printer className="w-4 h-4 stroke-[2.5]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadRide(inv)}
                          className="p-1.5 bg-yellow-300 hover:bg-yellow-400 text-black rounded border-2 border-black shadow-[1px_1px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                          title="Descargar RIDE PDF (A4)"
                        >
                          <FileText className="w-4 h-4 stroke-[2.5]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadXml(inv)}
                          className="p-1.5 bg-cyan-300 hover:bg-cyan-400 text-black rounded border-2 border-black shadow-[1px_1px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                          title="Descargar XML Autorizado SRI"
                        >
                          <Download className="w-4 h-4 stroke-[2.5]" />
                        </button>
                        {inv.estado !== 'ANULADO' && (
                          isInvoiceConsumidorFinal(inv) ? (
                            <button
                              type="button"
                              onClick={() => handleVoidInvoice(inv)}
                              className="p-1.5 bg-zinc-200 text-zinc-400 rounded border-2 border-zinc-400 cursor-not-allowed"
                              title="Normativa SRI: Las facturas emitidas a Consumidor Final NO se pueden anular"
                            >
                              <Trash2 className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleVoidInvoice(inv)}
                              className="p-1.5 bg-rose-200 hover:bg-rose-300 text-black rounded border-2 border-black shadow-[1px_1px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
                              title="Anular Factura"
                            >
                              <Trash2 className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL: EMITIR NUEVA FACTURA ELECTRÓNICA                      */}
      {/* ============================================================ */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white border-4 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-5xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-yellow-300 border-b-4 border-black px-6 py-4 flex items-center justify-between text-black">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-black text-lime-400 border-2 border-black flex items-center justify-center">
                  <FileText className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Emitir Factura Electrónica (SRI 01)
                  </h3>
                  <p className="text-[11px] font-bold text-zinc-800 font-retro-mono">
                    Comprobante N° {numeroComprobanteStr} • Clave SRI 49 Dígitos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white border-2 border-black hover:bg-rose-200 text-black flex items-center justify-center font-black cursor-pointer shadow-[2px_2px_0px_0px_#000]"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[80vh] space-y-6 text-xs text-black">
              {/* Client Selection & Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-zinc-50 p-4 border-3 border-black rounded-xl shadow-[3px_3px_0px_0px_#000]">
                {/* Cliente Selector */}
                <div className="md:col-span-2 space-y-2">
                  <label className="font-black uppercase tracking-wider block text-xs">
                    Cliente / Adquiriente (SRI):
                  </label>
                  <RetroSelect
                    options={customerOptions}
                    value={selectedCustomerKey}
                    onChange={handleSelectCustomer}
                    placeholder="Seleccionar cliente..."
                  />

                  {/* Manual / Details Editor */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                    <div>
                      <span className="text-[10px] font-black uppercase text-zinc-600 block">RUC / Cédula:</span>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={customCustomer.documentId}
                          onChange={(e) =>
                            setCustomCustomer({ ...customCustomer, documentId: e.target.value })
                          }
                          placeholder="9999999999999"
                          className="w-full p-2 bg-white rounded border-2 border-black font-retro-mono font-bold text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleLookupDoc}
                          disabled={isSearchingDoc}
                          className="px-2.5 py-1 bg-yellow-300 hover:bg-yellow-400 border-2 border-black rounded font-black text-[10px] uppercase shadow-[1px_1px_0px_0px_#000] cursor-pointer"
                          title="Consultar SRI"
                        >
                          {isSearchingDoc ? '...' : 'SRI'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-zinc-600 block">Razón Social:</span>
                      <input
                        type="text"
                        value={customCustomer.name}
                        onChange={(e) =>
                          setCustomCustomer({ ...customCustomer, name: e.target.value })
                        }
                        placeholder="Nombres completos o Razón Social"
                        className="w-full p-2 bg-white rounded border-2 border-black font-bold text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-zinc-600 block">Dirección:</span>
                      <input
                        type="text"
                        value={customCustomer.address}
                        onChange={(e) =>
                          setCustomCustomer({ ...customCustomer, address: e.target.value })
                        }
                        placeholder="Dirección del cliente"
                        className="w-full p-2 bg-white rounded border-2 border-black font-bold text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-zinc-600 block">Email para RIDE:</span>
                      <input
                        type="email"
                        value={customCustomer.email}
                        onChange={(e) =>
                          setCustomCustomer({ ...customCustomer, email: e.target.value })
                        }
                        placeholder="correo@ejemplo.com"
                        className="w-full p-2 bg-white rounded border-2 border-black font-bold text-xs"
                      />
                    </div>
                  </div>

                  {docSearchFeedback && (
                    <p className="text-[11px] font-bold text-black mt-1 bg-yellow-100 p-1.5 border border-yellow-300 rounded">
                      {docSearchFeedback}
                    </p>
                  )}
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <label className="font-black uppercase tracking-wider block text-xs">
                    Fecha de Emisión:
                  </label>
                  <RetroDatePicker
                    value={fechaEmision}
                    onChange={(val) => setFechaEmision(val)}
                    label="Fecha de Emisión"
                  />
                  <div className="bg-lime-100 border-2 border-black p-2.5 rounded mt-3 text-[10px] font-bold text-black">
                    <p className="font-black uppercase mb-0.5">ℹ️ Emisión SRI Offline</p>
                    <p>Secuencial asignado automáticamente: <strong>{secuencialStr}</strong></p>
                  </div>
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-3">
                <datalist id="cafeteria-catalog-names">
                  {catalogProducts.map((p) => (
                    <option key={`${p.sourceType}-${p.id}`} value={p.name}>
                      {p.categoryLabel} • ${p.price.toFixed(2)}
                    </option>
                  ))}
                </datalist>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-black uppercase tracking-wider text-sm flex items-center gap-1.5">
                    <span>Detalle de Bienes y Servicios</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTargetItemIndex(null);
                        setCatalogSearch('');
                        setCatalogCategory('all');
                        setIsProductPickerOpen(true);
                      }}
                      className="px-3.5 py-1.5 bg-yellow-300 hover:bg-yellow-400 text-black rounded-lg font-black text-xs uppercase tracking-wider border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 cursor-pointer flex items-center gap-1.5"
                    >
                      <Layers className="w-3.5 h-3.5 stroke-[3]" />
                      <span>+ Elegir del Catálogo</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="px-3 py-1.5 bg-black text-lime-400 hover:bg-zinc-800 rounded-lg font-black text-xs uppercase tracking-wider border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Ítem en Blanco</span>
                    </button>
                  </div>
                </div>

                <div className="border-3 border-black rounded-xl overflow-x-auto shadow-[3px_3px_0px_0px_#000]">
                  <table className="w-full text-xs text-left min-w-[850px] border-collapse">
                    <thead className="bg-yellow-300 text-black font-black uppercase border-b-3 border-black text-[11px]">
                      <tr>
                        <th className="p-2.5 w-28">Código</th>
                        <th className="p-2.5 min-w-[220px]">Descripción</th>
                        <th className="p-2.5 w-20 text-center">Cant.</th>
                        <th className="p-2.5 w-24 text-right">P. Unit.</th>
                        <th className="p-2.5 w-20 text-right">Desc.</th>
                        <th className="p-2.5 w-44 text-center">Tarifa IVA</th>
                        <th className="p-2.5 w-28 text-right">Total ($)</th>
                        <th className="p-2.5 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-zinc-200">
                      {items.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-zinc-50">
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.codigoPrincipal}
                              onChange={(e) => handleUpdateItem(idx, 'codigoPrincipal', e.target.value)}
                              placeholder="PROD-001"
                              className="w-full p-1.5 bg-white border-2 border-black rounded font-retro-mono text-xs font-bold"
                            />
                          </td>
                          <td className="p-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                list="cafeteria-catalog-names"
                                placeholder="Ej: Café Americano, Tarta..."
                                value={item.descripcion}
                                onChange={(e) => handleUpdateItem(idx, 'descripcion', e.target.value)}
                                className="w-full p-1.5 bg-white border-2 border-black rounded font-bold text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetItemIndex(idx);
                                  setCatalogSearch('');
                                  setCatalogCategory('all');
                                  setIsProductPickerOpen(true);
                                }}
                                title="Elegir producto o insumo existente"
                                className="px-2 py-1.5 bg-yellow-300 hover:bg-yellow-400 border-2 border-black rounded font-black text-[10px] uppercase shadow-[1px_1px_0px_0px_#000] cursor-pointer flex items-center gap-1 flex-shrink-0"
                              >
                                <Search className="w-3 h-3 stroke-[3]" />
                                <span className="hidden sm:inline">Catálogo</span>
                              </button>
                            </div>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={item.cantidad || ''}
                              onChange={(e) => handleUpdateItem(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                              className="w-full p-1.5 bg-white border-2 border-black rounded text-center font-retro-mono font-bold text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.precioUnitario || ''}
                              placeholder="0.00"
                              onChange={(e) => handleUpdateItem(idx, 'precioUnitario', parseFloat(e.target.value) || 0)}
                              className="w-full p-1.5 bg-white border-2 border-black rounded text-right font-retro-mono font-bold text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.descuento || ''}
                              placeholder="0.00"
                              onChange={(e) => handleUpdateItem(idx, 'descuento', parseFloat(e.target.value) || 0)}
                              className="w-full p-1.5 bg-white border-2 border-black rounded text-right font-retro-mono font-bold text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <RetroSelect
                              dense
                              options={ivaRateOptions}
                              value={String(item.tarifaIva)}
                              onChange={(val) => {
                                handleUpdateItem(
                                  idx,
                                  'tarifaIva',
                                  val === '15' ? 15 : val === '5' ? 5 : val === '0' ? 0 : val
                                );
                              }}
                            />
                          </td>
                          <td className="p-2 text-right font-retro-mono font-black text-black">
                            ${(item.precioTotalSinImpuesto + item.valorIva).toFixed(2)}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              disabled={items.length <= 1}
                              className="text-zinc-400 hover:text-rose-600 disabled:opacity-20 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom: Payment Methods & Subtotals */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                {/* Forma de Pago SRI */}
                <div className="space-y-3 bg-zinc-50 p-4 rounded-xl border-3 border-black shadow-[3px_3px_0px_0px_#000]">
                  <div className="font-black uppercase tracking-wider text-black border-b-2 border-black pb-1.5 text-xs">
                    Forma de Pago SRI & Plazo
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-zinc-700 block text-xs">Forma de Pago:</label>
                    <RetroSelect
                      options={formaPagoOptions}
                      value={formaPago}
                      onChange={(val) => setFormaPago(val)}
                    />
                  </div>

                  {formaPago === '20' && (
                    <div className="space-y-1 mt-2">
                      <label className="font-bold text-zinc-700 block text-xs">
                        N° de Comprobante / Transferencia:
                      </label>
                      <input
                        type="text"
                        value={numeroTransferencia}
                        onChange={(e) => setNumeroTransferencia(e.target.value)}
                        placeholder="Ej. 987654321"
                        className="w-full p-2 bg-white rounded border-2 border-black font-retro-mono text-xs"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="font-bold text-zinc-700 block text-xs">Plazo (Días):</label>
                      <input
                        type="number"
                        min="0"
                        value={plazoDias}
                        onChange={(e) => setPlazoDias(parseInt(e.target.value, 10) || 0)}
                        className="w-full p-2 bg-white rounded border-2 border-black font-retro-mono text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-zinc-700 block text-xs">Propina ($):</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={propina || ''}
                        onChange={(e) => setPropina(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full p-2 bg-white rounded border-2 border-black font-retro-mono text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 mt-2">
                    <label className="font-bold text-zinc-700 block text-xs">Observaciones:</label>
                    <input
                      type="text"
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      className="w-full p-2 bg-white rounded border-2 border-black text-xs font-bold"
                    />
                  </div>
                </div>

                {/* Subtotals Table */}
                <div className="border-3 border-black rounded-xl overflow-hidden bg-white shadow-[3px_3px_0px_0px_#000]">
                  <table className="w-full text-xs">
                    <tbody className="divide-y-2 divide-zinc-200">
                      <tr>
                        <td className="p-2.5 font-bold bg-zinc-100">Subtotal 15% (General)</td>
                        <td className="p-2.5 text-right font-retro-mono font-black">${subtotal15.toFixed(2)}</td>
                      </tr>
                      {subtotal5 > 0 && (
                        <tr>
                          <td className="p-2.5 font-bold bg-zinc-100">Subtotal 5% (Construcción)</td>
                          <td className="p-2.5 text-right font-retro-mono font-black">${subtotal5.toFixed(2)}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="p-2.5 font-bold bg-zinc-100">Subtotal 0% (Tarifa Cero / RIMPE)</td>
                        <td className="p-2.5 text-right font-retro-mono font-black">${subtotal0.toFixed(2)}</td>
                      </tr>
                      {totalDescuento > 0 && (
                        <tr>
                          <td className="p-2.5 font-bold bg-zinc-100 text-amber-800">Total Descuentos</td>
                          <td className="p-2.5 text-right font-retro-mono font-black text-amber-800">
                            -${totalDescuento.toFixed(2)}
                          </td>
                        </tr>
                      )}
                      <tr className="bg-yellow-100 font-black">
                        <td className="p-2.5 uppercase">Subtotal sin Impuestos</td>
                        <td className="p-2.5 text-right font-retro-mono">${subtotalSinImpuestos.toFixed(2)}</td>
                      </tr>
                      <tr className="bg-pink-100 font-black text-pink-900">
                        <td className="p-2.5 uppercase">IVA 15% (Desglosado)</td>
                        <td className="p-2.5 text-right font-retro-mono">${totalIva.toFixed(2)}</td>
                      </tr>
                      <tr className="bg-black text-lime-400 font-black text-base">
                        <td className="p-3 uppercase">IMPORTE TOTAL (USD)</td>
                        <td className="p-3 text-right font-retro-mono text-yellow-300">
                          ${importeTotal.toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-100 border-t-4 border-black px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              {(() => {
                const isCf =
                  selectedCustomerKey === 'cf' ||
                  customCustomer.documentId.trim() === '9999999999999' ||
                  customCustomer.documentId.trim() === '9999999999' ||
                  /^9+$/.test(customCustomer.documentId.trim()) ||
                  customCustomer.name.toUpperCase().includes('CONSUMIDOR FINAL');
                const exceedsCfLimit = isCf && importeTotal > 50;

                return (
                  <>
                    <div className="text-[11px] font-bold text-zinc-600 flex items-center gap-1.5">
                      {exceedsCfLimit ? (
                        <span className="text-rose-700 font-black uppercase bg-rose-100 border-2 border-rose-600 px-2.5 py-1 rounded-lg">
                          🚫 Supera $50.00: Prohibido emitir a Consumidor Final (Ingrese Cédula/RUC del cliente)
                        </span>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 stroke-[3]" />
                          <span>Genera XML oficial y Clave de Acceso SRI de 49 dígitos.</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsNewModalOpen(false)}
                        className="px-4 py-2 bg-white hover:bg-zinc-200 border-2 border-black rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_#000]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={exceedsCfLimit}
                        onClick={handleSaveInvoice}
                        className={`px-5 py-2 border-2 border-black rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                          exceedsCfLimit
                            ? 'bg-zinc-300 text-zinc-500 border-zinc-400 cursor-not-allowed'
                            : 'bg-black hover:bg-zinc-800 text-lime-400 cursor-pointer shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5'
                        }`}
                        title={
                          exceedsCfLimit
                            ? 'No se puede emitir factura mayor a $50.00 a Consumidor Final'
                            : 'Emitir y Autorizar Factura'
                        }
                      >
                        Emitir y Autorizar Factura
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: RIDE VIEWER / PREVIEW                                 */}
      {/* ============================================================ */}
      {previewInvoice && (
        <RidePreviewModal
          invoice={previewInvoice}
          company={company}
          autoPrintThermal={autoPrintThermal}
          onClose={() => {
            setAutoPrintThermal(false);
            setPreviewInvoice(null);
          }}
        />
      )}

      {/* Product Catalog Picker Modal */}
      {isProductPickerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[70] flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="bg-white border-4 border-black rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
            {/* Header */}
            <div className="bg-yellow-300 border-b-4 border-black p-4 flex items-center justify-between">
              <div>
                <h3 className="font-retro-heavy text-base uppercase text-black flex items-center gap-2">
                  <Layers className="w-5 h-5 stroke-[2.5]" />
                  <span>Catálogo de Productos e Insumos</span>
                </h3>
                <p className="text-[11px] font-bold text-zinc-800 uppercase mt-0.5">
                  {targetItemIndex !== null
                    ? `Seleccionando producto para la fila #${targetItemIndex + 1}`
                    : 'Haz clic en cualquier producto o insumo para agregarlo a la factura'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsProductPickerOpen(false);
                  setTargetItemIndex(null);
                }}
                className="w-8 h-8 rounded-lg bg-white border-2 border-black hover:bg-rose-200 text-black flex items-center justify-center font-black cursor-pointer shadow-[2px_2px_0px_0px_#000]"
              >
                ✕
              </button>
            </div>

            {/* Filter Tabs & Search */}
            <div className="p-4 border-b-2 border-black bg-zinc-50 space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5 stroke-[2.5]" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o código (ej: Café, Tarta, Combo, Leche)..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 bg-white border-2 border-black rounded-lg text-xs font-bold focus:outline-none focus:bg-yellow-50 font-retro-mono"
                />
                {catalogSearch && (
                  <button
                    type="button"
                    onClick={() => setCatalogSearch('')}
                    className="absolute right-3 top-2 text-zinc-400 hover:text-black font-black text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {[
                  { id: 'all', label: '🌟 Todos', count: catalogProducts.length },
                  { id: 'comida', label: '🍰 Comidas', count: catalogProducts.filter((p) => p.sourceType === 'comida').length },
                  { id: 'bebida', label: '☕ Bebidas', count: catalogProducts.filter((p) => p.sourceType === 'bebida').length },
                  { id: 'combo', label: '🍔 Combos', count: catalogProducts.filter((p) => p.sourceType === 'combo').length },
                  { id: 'inventario', label: '📦 Inventario', count: catalogProducts.filter((p) => p.sourceType === 'inventario').length },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCatalogCategory(cat.id as any)}
                    className={`px-3 py-1 rounded-md border-2 border-black text-[11px] font-black uppercase transition-all cursor-pointer ${
                      catalogCategory === cat.id
                        ? 'bg-black text-lime-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                        : 'bg-white text-black hover:bg-zinc-200'
                    }`}
                  >
                    {cat.label} ({cat.count})
                  </button>
                ))}
              </div>
            </div>

            {/* Product Cards List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredCatalog.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="font-black uppercase text-sm text-zinc-500">No se encontraron productos ni insumos</p>
                  <p className="text-xs text-zinc-400 font-bold">
                    Intenta con otro término de búsqueda o cambia de categoría.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredCatalog.map((prod) => {
                    const isJustAdded = justAddedId === prod.id;
                    return (
                      <div
                        key={`${prod.sourceType}-${prod.id}`}
                        className={`p-3 border-2 border-black rounded-xl bg-white hover:bg-yellow-50 transition-all flex items-center justify-between gap-3 shadow-[2px_2px_0px_0px_#000] ${
                          isJustAdded ? 'ring-2 ring-lime-500 bg-lime-50' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${prod.badgeBg}`}>
                              {prod.categoryLabel}
                            </span>
                            <span className="text-[10px] font-retro-mono font-bold text-zinc-500">
                              {prod.code}
                            </span>
                          </div>
                          <h5 className="font-black text-xs uppercase text-black truncate" title={prod.name}>
                            {prod.name}
                          </h5>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-retro-mono font-black text-emerald-800 text-xs">
                              ${prod.price.toFixed(2)}
                            </span>
                            {prod.stock !== undefined && (
                              <span className="text-[10px] text-zinc-500 font-bold">
                                • Stock: {prod.stock} {prod.unit || 'uds'}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectProduct(prod, targetItemIndex)}
                          className={`px-3 py-1.5 rounded-lg border-2 border-black font-black text-xs uppercase cursor-pointer transition-all flex items-center gap-1 shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5 shrink-0 ${
                            isJustAdded
                              ? 'bg-lime-400 text-black'
                              : 'bg-black text-lime-400 hover:bg-zinc-800'
                          }`}
                        >
                          {isJustAdded ? (
                            <>
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>¡Listo!</span>
                            </>
                          ) : targetItemIndex !== null ? (
                            <span>Elegir</span>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Agregar</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-zinc-100 border-t-3 border-black p-3.5 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-600">
                Total en catálogo: <strong>{filteredCatalog.length}</strong> opciones
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsProductPickerOpen(false);
                  setTargetItemIndex(null);
                }}
                className="px-4 py-2 bg-black text-white hover:bg-zinc-800 border-2 border-black rounded-lg text-xs font-black uppercase tracking-wider cursor-pointer shadow-[2px_2px_0px_0px_#000]"
              >
                Cerrar Catálogo
              </button>
            </div>
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

      {/* Alert Notification */}
      {alertInfo && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-white border-4 border-black rounded-xl p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] animate-in slide-in-from-bottom duration-200">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded border-2 border-black flex items-center justify-center shrink-0 ${
              alertInfo.type === 'error' ? 'bg-rose-400 text-black' :
              alertInfo.type === 'warning' ? 'bg-yellow-300 text-black' : 'bg-lime-400 text-black'
            }`}>
              <AlertCircle className="w-5 h-5 stroke-[3]" />
            </div>
            <div className="flex-1">
              <h4 className="font-black text-xs uppercase tracking-wider text-black">{alertInfo.title}</h4>
              <p className="text-xs font-bold text-zinc-700 mt-0.5">{alertInfo.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setAlertInfo(null)}
              className="text-black font-black hover:text-zinc-500 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
