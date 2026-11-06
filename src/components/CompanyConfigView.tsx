/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  Save,
  AlertTriangle,
  Key,
  Database,
  Download,
  Upload,
  Search,
  Check,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  MapPin,
  Mail,
  Phone,
  Hash,
  Layers,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { CompanyConfig, TaxRegime } from '../types';
import { consultarIdentificacionSri } from '../utils/sriConsultas';
import { validarDocumentoEcuatoriano } from './POSView';
import { sendTestSmtpEmail } from '../utils/emailService';

interface CompanyConfigViewProps {
  company: CompanyConfig;
  onUpdateCompany: (updated: CompanyConfig) => void;
}

const REGIMEN_OPTIONS: {
  value: TaxRegime;
  label: string;
  badge: string;
  badgeColor: string;
  description: string;
}[] = [
  {
    value: 'RIMPE_NEGOCIO_POPULAR',
    label: 'Régimen RIMPE - Negocio Popular',
    badge: 'Neg. Popular',
    badgeColor: 'bg-pink-300 text-black',
    description: 'Hasta $20,000 anuales. Emite Notas de Venta o Facturas tarifa 0%',
  },
  {
    value: 'RIMPE_EMPRENDEDOR',
    label: 'Régimen RIMPE - Emprendedor',
    badge: 'Emprendedor',
    badgeColor: 'bg-cyan-300 text-black',
    description: '$20,001 a $300,000 anuales. Facturas electrónicas con IVA',
  },
  {
    value: 'GENERAL',
    label: 'Régimen General',
    badge: 'General',
    badgeColor: 'bg-yellow-300 text-black',
    description: 'Sociedades y Personas Naturales en régimen general ordinario',
  },
  {
    value: 'ARTESANO_CALIFICADO',
    label: 'Artesano Calificado',
    badge: 'Artesano',
    badgeColor: 'bg-emerald-300 text-black',
    description: 'Calificación oficial emitida por la Junta Nacional del Artesano',
  },
];

const IVA_OPTIONS = [
  {
    value: 15,
    label: '15% - Tarifa General Vigente',
    badge: '15%',
    badgeColor: 'bg-amber-300 text-black',
    description: 'Tarifa general de IVA actualmente vigente en Ecuador',
  },
  {
    value: 5,
    label: '5% - Materiales de Construcción',
    badge: '5%',
    badgeColor: 'bg-fuchsia-300 text-black',
    description: 'Tarifa reducida para el sector de la construcción',
  },
  {
    value: 0,
    label: '0% - Tarifa Cero IVA',
    badge: '0%',
    badgeColor: 'bg-lime-300 text-black',
    description: 'Canasta básica, insumos o negocios populares tarifa 0%',
  },
];

interface RetroCustomSelectProps<T> {
  label: string;
  required?: boolean;
  options: {
    value: T;
    label: string;
    badge?: string;
    badgeColor?: string;
    description?: string;
  }[];
  value: T;
  onChange: (val: T) => void;
}

function RetroCustomSelect<T extends string | number>({
  label,
  required,
  options,
  value,
  onChange,
}: RetroCustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value) || options[0];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="block uppercase text-zinc-800 mb-1 font-black text-xs">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>

      {/* Trigger Button Estilo Retro Neo-Brutalist */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-yellow-50 hover:bg-yellow-100 border-3 border-black rounded-xl p-2.5 flex items-center justify-between text-left shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5 transition-all cursor-pointer focus:outline-none"
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {selected.badge && (
            <span className={`px-2 py-0.5 border-2 border-black rounded text-[10px] font-black uppercase shrink-0 shadow-[1px_1px_0px_0px_#000] ${selected.badgeColor || 'bg-white'}`}>
              {selected.badge}
            </span>
          )}
          <span className="font-black text-xs text-black uppercase truncate">
            {selected.label}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 stroke-[3] text-black shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Menú Desplegable Flotante */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border-3 border-black rounded-xl shadow-[6px_6px_0px_0px_#000] p-1.5 z-50 max-h-64 overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-100">
          {options.map((opt) => {
            const isCurrent = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left p-2.5 rounded-lg border-2 transition-all cursor-pointer flex flex-col gap-0.5 ${
                  isCurrent
                    ? 'bg-lime-300 border-black shadow-[2px_2px_0px_0px_#000]'
                    : 'bg-white hover:bg-yellow-100 border-transparent hover:border-black'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    {opt.badge && (
                      <span className={`px-1.5 py-0.5 border border-black rounded text-[9px] font-black uppercase ${opt.badgeColor || 'bg-white'}`}>
                        {opt.badge}
                      </span>
                    )}
                    <span className="font-black text-xs text-black uppercase">
                      {opt.label}
                    </span>
                  </div>
                  {isCurrent && <Check className="w-4 h-4 stroke-[3] text-black shrink-0" />}
                </div>
                {opt.description && (
                  <p className="text-[10px] font-bold text-zinc-600 uppercase pl-0.5">
                    {opt.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CompanyConfigView({ company, onUpdateCompany }: CompanyConfigViewProps) {
  const [formData, setFormData] = useState<CompanyConfig>(company);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSearchingRuc, setIsSearchingRuc] = useState(false);
  const [rucSearchFeedback, setRucSearchFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState(company.email || company.smtpUser || '');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpTestFeedback, setSmtpTestFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setFormData(company);
  }, [company]);

  const handleChange = <K extends keyof CompanyConfig>(field: K, value: CompanyConfig[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Buscar RUC en el SRI automáticamente
  const handleLookupRuc = async () => {
    const cleanRuc = (formData.ruc || '').trim().replace(/\D/g, '');
    if (!cleanRuc) {
      setRucSearchFeedback({ success: false, message: 'Ingrese un número de RUC para consultar.' });
      return;
    }

    if (cleanRuc.length !== 13) {
      setRucSearchFeedback({
        success: false,
        message: `El RUC debe tener 13 dígitos numéricos (actualmente tiene ${cleanRuc.length}).`
      });
      return;
    }

    setIsSearchingRuc(true);
    setRucSearchFeedback(null);

    try {
      const res = await consultarIdentificacionSri(cleanRuc);
      if (res.success && res.nombre) {
        setFormData(prev => {
          let updatedRegimen: TaxRegime = prev.regimenTributario;
          if (res.regimen) {
            const norm = res.regimen.toUpperCase();
            if (norm.includes('POPULAR')) updatedRegimen = 'RIMPE_NEGOCIO_POPULAR';
            else if (norm.includes('EMPRENDEDOR')) updatedRegimen = 'RIMPE_EMPRENDEDOR';
            else if (norm.includes('GENERAL')) updatedRegimen = 'GENERAL';
          }

          return {
            ...prev,
            ruc: cleanRuc,
            razonSocial: res.razonSocial || res.nombre,
            nombreComercial: res.nombreComercial || prev.nombreComercial || res.razonSocial || res.nombre,
            regimenTributario: updatedRegimen,
            obligadoContabilidad: (res.obligadoContabilidad as 'SI' | 'NO') || prev.obligadoContabilidad || 'NO',
            agenteRetencion: res.rucData?.agenteRetencion === 'SI' ? (prev.agenteRetencion || 'SI') : prev.agenteRetencion,
            contribuyenteEspecial: res.rucData?.contribuyenteEspecial === 'SI' ? (prev.contribuyenteEspecial || 'SI') : prev.contribuyenteEspecial,
          };
        });

        setRucSearchFeedback({
          success: true,
          message: `✅ Datos encontrados en el SRI: ${res.razonSocial || res.nombre} (${res.estado || 'ACTIVO'})`
        });
      } else {
        setRucSearchFeedback({
          success: false,
          message: res.error || 'No se encontraron datos registrados en el SRI para este RUC.'
        });
      }
    } catch (err: any) {
      setRucSearchFeedback({
        success: false,
        message: err.message || 'Error al conectar con los servicios del SRI.'
      });
    } finally {
      setIsSearchingRuc(false);
    }
  };

  // Cargar archivo .p12 / .pfx a Base64
  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.p12') && !file.name.toLowerCase().endsWith('.pfx')) {
      alert('Solo se admiten certificados de firma electrónica en formato .p12 o .pfx');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      setFormData(prev => ({
        ...prev,
        firmaElectronicaBase64: base64,
        firmaElectronicaNombre: file.name
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const cleanRuc = (formData.ruc || '').trim().replace(/\D/g, '');
    if (!cleanRuc) {
      setValidationError('El número de RUC es obligatorio para emitir comprobantes.');
      return;
    }

    if (cleanRuc.length !== 13) {
      setValidationError(`El RUC debe tener 13 dígitos numéricos (tiene ${cleanRuc.length}).`);
      return;
    }

    const rucValidation = validarDocumentoEcuatoriano(cleanRuc);
    if (!rucValidation.valido) {
      const confirmSave = window.confirm(
        `Atención: ${rucValidation.mensaje}. ¿Desea guardar la configuración de todas formas?`
      );
      if (!confirmSave) return;
    }

    if (!formData.razonSocial.trim()) {
      setValidationError('La Razón Social es obligatoria.');
      return;
    }

    if (!formData.dirMatriz.trim()) {
      setValidationError('La Dirección Matriz es requerida por el SRI.');
      return;
    }

    if (!formData.codigoEstablecimiento.trim() || formData.codigoEstablecimiento.length !== 3) {
      setValidationError('El código de establecimiento debe tener 3 dígitos (ej: 001).');
      return;
    }

    if (!formData.puntoEmision.trim() || formData.puntoEmision.length !== 3) {
      setValidationError('El punto de emisión debe tener 3 dígitos (ej: 001).');
      return;
    }

    onUpdateCompany(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(formData, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `config_sri_${formData.ruc || 'emisor'}.json`);
    dlAnchor.click();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed === 'object') {
          setFormData(prev => ({ ...prev, ...parsed }));
          alert('Configuración SRI importada con éxito. Recuerde hacer clic en Guardar.');
        }
      } catch (err) {
        alert('Archivo JSON de configuración no válido.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Banner Superior Retro */}
      <div className="bg-amber-300 border-4 border-black p-5 rounded-2xl shadow-[6px_6px_0px_0px_#000] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-black text-amber-300 rounded-lg">
              <Building2 className="w-6 h-6" />
            </span>
            <h2 className="text-xl font-retro-heavy uppercase text-black tracking-wider">
              CONFIGURACIÓN SRI & DATOS DEL EMISOR
            </h2>
          </div>
          <p className="text-xs font-bold text-zinc-900 mt-1 uppercase tracking-wide">
            Ingrese los datos tributarios de su cafetería para la emisión legal de Facturas y Notas de Venta ante el SRI.
          </p>
        </div>

        {savedSuccess && (
          <div className="bg-emerald-300 border-3 border-black text-black px-4 py-2 rounded-xl font-black text-xs uppercase flex items-center gap-2 shadow-[3px_3px_0px_0px_#000] animate-bounce">
            <CheckCircle2 className="w-5 h-5 text-emerald-950" />
            <span>¡CONFIGURACIÓN GUARDADA CON ÉXITO!</span>
          </div>
        )}
      </div>

      {validationError && (
        <div className="bg-rose-200 border-3 border-black p-4 rounded-xl shadow-[4px_4px_0px_0px_#000] flex items-center gap-3 text-rose-950 font-black text-xs uppercase">
          <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECCIÓN 1: IDENTIFICACIÓN LEGAL */}
        <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000] space-y-5">
          <div className="border-b-3 border-black pb-3 flex items-center gap-2">
            <span className="p-1.5 bg-cyan-300 border-2 border-black rounded-lg">
              <ShieldCheck className="w-5 h-5 text-black" />
            </span>
            <h3 className="font-retro-heavy text-sm uppercase text-black">
              1. IDENTIFICACIÓN LEGAL DEL EMISOR (MATRIZ / NEGOCIO)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-black">
            {/* RUC con consulta SRI */}
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block uppercase text-zinc-800 mb-1">
                R.U.C. del Emisor (13 dígitos) <span className="text-rose-600">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={13}
                  required
                  placeholder="Ej: 1790016919001"
                  value={formData.ruc}
                  onChange={e => handleChange('ruc', e.target.value.replace(/\D/g, ''))}
                  className="flex-1 bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-retro-mono text-sm font-bold text-black focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleLookupRuc}
                  disabled={isSearchingRuc || !formData.ruc.trim()}
                  className="bg-cyan-300 hover:bg-cyan-400 border-3 border-black rounded-lg px-3 py-2 text-black font-black flex items-center justify-center cursor-pointer shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 transition-all"
                  title="Consultar y autocompletar con el SRI oficial"
                >
                  {isSearchingRuc ? (
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <Search className="w-4 h-4 stroke-[3]" />
                  )}
                </button>
              </div>
              {rucSearchFeedback && (
                <p className={`text-[10px] font-black uppercase mt-1 ${rucSearchFeedback.success ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {rucSearchFeedback.message}
                </p>
              )}
            </div>

            {/* Razón Social */}
            <div className="md:col-span-2">
              <label className="block uppercase text-zinc-800 mb-1">
                Razón Social (Segunda línea en facturas) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej: APELLIDOS Y NOMBRES O NOMBRE DE EMPRESA S.A."
                value={formData.razonSocial}
                onChange={e => handleChange('razonSocial', e.target.value.toUpperCase())}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold uppercase text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Nombre Comercial */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Nombre Comercial (Marca de la Cafetería) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej: MOCCAPRICHO CAFETERÍA"
                value={formData.nombreComercial}
                onChange={e => handleChange('nombreComercial', e.target.value.toUpperCase())}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold uppercase text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Correo Electrónico */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Correo Electrónico (Notificaciones SRI) <span className="text-rose-600">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="Ej: facturacion@cafeteria.com"
                value={formData.email}
                onChange={e => handleChange('email', e.target.value)}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Teléfono */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Teléfono de Contacto
              </label>
              <input
                type="text"
                placeholder="Ej: 0998212307"
                value={formData.telefono}
                onChange={e => handleChange('telefono', e.target.value)}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Logotipo para el RIDE */}
            <div className="md:col-span-2 lg:col-span-3 pt-1">
              <label className="block uppercase text-zinc-800 mb-1">
                Logotipo del Negocio para el RIDE (Opcional - PNG / JPG)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="bg-cyan-200 hover:bg-cyan-300 border-3 border-black rounded-lg px-3.5 py-2 text-black font-black uppercase text-xs flex items-center gap-2 cursor-pointer shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 transition-all">
                  <Upload className="w-4 h-4 stroke-[3]" />
                  <span>Subir Logo para RIDE</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        handleChange('logoUrl', reader.result as string);
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
                {formData.logoUrl && (
                  <div className="flex items-center gap-2 bg-zinc-50 border-2 border-black rounded-lg px-3 py-1">
                    <img
                      src={formData.logoUrl}
                      alt="Logo RIDE"
                      className="h-8 max-w-[110px] object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => handleChange('logoUrl', '')}
                      className="text-[10px] font-black text-rose-600 hover:underline uppercase cursor-pointer"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SECCIÓN 2: DIRECCIONES Y PUNTOS DE EMISIÓN */}
        <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000] space-y-5">
          <div className="border-b-3 border-black pb-3 flex items-center gap-2">
            <span className="p-1.5 bg-fuchsia-300 border-2 border-black rounded-lg">
              <MapPin className="w-5 h-5 text-black" />
            </span>
            <h3 className="font-retro-heavy text-sm uppercase text-black">
              2. DIRECCIONES, ESTABLECIMIENTO Y PUNTOS DE EMISIÓN SRI
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-black">
            {/* Dirección Matriz */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Dirección Matriz (Según RUC SRI) <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Av. Maldonado S/N y Guamaní, Quito"
                value={formData.dirMatriz}
                onChange={e => handleChange('dirMatriz', e.target.value)}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Dirección Establecimiento */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Dirección del Establecimiento / Sucursal <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Calle Principal 123 y Secundaria"
                value={formData.dirEstablecimiento}
                onChange={e => handleChange('dirEstablecimiento', e.target.value)}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Código Establecimiento */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block uppercase text-zinc-800 mb-1">
                  Establecimiento (3 dígitos) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={3}
                  required
                  placeholder="001"
                  value={formData.codigoEstablecimiento}
                  onChange={e => handleChange('codigoEstablecimiento', e.target.value.padStart(3, '0').slice(-3))}
                  className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-retro-mono text-center font-black text-black focus:bg-white focus:outline-none"
                />
              </div>

              {/* Punto de Emisión */}
              <div>
                <label className="block uppercase text-zinc-800 mb-1">
                  Pto. Emisión (3 dígitos) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={3}
                  required
                  placeholder="001"
                  value={formData.puntoEmision}
                  onChange={e => handleChange('puntoEmision', e.target.value.padStart(3, '0').slice(-3))}
                  className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-retro-mono text-center font-black text-black focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Secuenciales Numéricos */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block uppercase text-zinc-800 mb-1">
                  Secuencial Factura SRI
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.secuencialFactura || 1}
                  onChange={e => handleChange('secuencialFactura', parseInt(e.target.value) || 1)}
                  className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-retro-mono text-center font-black text-black focus:bg-white focus:outline-none"
                />
                <span className="text-[10px] text-zinc-500 font-bold block mt-0.5">
                  Actual: #{String(formData.secuencialFactura || 1).padStart(9, '0')}
                </span>
              </div>

              <div>
                <label className="block uppercase text-zinc-800 mb-1">
                  Secuencial Nota de Venta
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.secuencialNotaVenta || 1}
                  onChange={e => handleChange('secuencialNotaVenta', parseInt(e.target.value) || 1)}
                  className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-retro-mono text-center font-black text-black focus:bg-white focus:outline-none"
                />
                <span className="text-[10px] text-zinc-500 font-bold block mt-0.5">
                  Actual: #{String(formData.secuencialNotaVenta || 1).padStart(6, '0')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECCIÓN 3: RÉGIMEN TRIBUTARIO Y PARÁMETROS FISCALES */}
        <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000] space-y-5">
          <div className="border-b-3 border-black pb-3 flex items-center gap-2">
            <span className="p-1.5 bg-lime-300 border-2 border-black rounded-lg">
              <Layers className="w-5 h-5 text-black" />
            </span>
            <h3 className="font-retro-heavy text-sm uppercase text-black">
              3. RÉGIMEN TRIBUTARIO & PARÁMETROS DEL SRI
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-black">
            {/* Ambiente SRI */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Ambiente del SRI <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('ambiente', '1')}
                  className={`py-2 px-3 border-3 border-black rounded-lg font-black uppercase text-[11px] transition-all cursor-pointer ${
                    formData.ambiente === '1'
                      ? 'bg-amber-300 text-black shadow-[2px_2px_0px_0px_#000]'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  🧪 1 - Pruebas
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('ambiente', '2')}
                  className={`py-2 px-3 border-3 border-black rounded-lg font-black uppercase text-[11px] transition-all cursor-pointer ${
                    formData.ambiente === '2'
                      ? 'bg-emerald-300 text-black shadow-[2px_2px_0px_0px_#000]'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  🚀 2 - Producción
                </button>
              </div>
            </div>

            {/* Régimen Tributario */}
            <RetroCustomSelect
              label="Régimen Tributario del Emisor"
              required
              options={REGIMEN_OPTIONS}
              value={formData.regimenTributario}
              onChange={val => handleChange('regimenTributario', val)}
            />

            {/* Obligado a llevar contabilidad */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                ¿Obligado a Llevar Contabilidad? <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('obligadoContabilidad', 'NO')}
                  className={`py-2 px-3 border-3 border-black rounded-lg font-black uppercase text-[11px] transition-all cursor-pointer ${
                    formData.obligadoContabilidad === 'NO'
                      ? 'bg-pink-300 text-black shadow-[2px_2px_0px_0px_#000]'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  NO
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('obligadoContabilidad', 'SI')}
                  className={`py-2 px-3 border-3 border-black rounded-lg font-black uppercase text-[11px] transition-all cursor-pointer ${
                    formData.obligadoContabilidad === 'SI'
                      ? 'bg-cyan-300 text-black shadow-[2px_2px_0px_0px_#000]'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  SÍ
                </button>
              </div>
            </div>

            {/* Tarifa IVA Predeterminada */}
            <RetroCustomSelect
              label="Tarifa IVA Predeterminada"
              options={IVA_OPTIONS}
              value={formData.tarifaIvaPredeterminada}
              onChange={val => handleChange('tarifaIvaPredeterminada', val)}
            />

            {/* Agente de Retención */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Resolución Agente de Retención (Si aplica)
              </label>
              <input
                type="text"
                placeholder="Ej: NAC-DNCRASC20-00000001"
                value={formData.agenteRetencion || ''}
                onChange={e => handleChange('agenteRetencion', e.target.value)}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Contribuyente Especial */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Resolución Contribuyente Especial (Si aplica)
              </label>
              <input
                type="text"
                placeholder="Ej: Resolución Nro. 155"
                value={formData.contribuyenteEspecial || ''}
                onChange={e => handleChange('contribuyenteEspecial', e.target.value)}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* SECCIÓN 4: FIRMA ELECTRÓNICA (.P12 / .PFX) */}
        <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000] space-y-5">
          <div className="border-b-3 border-black pb-3 flex items-center gap-2">
            <span className="p-1.5 bg-yellow-300 border-2 border-black rounded-lg">
              <Key className="w-5 h-5 text-black" />
            </span>
            <h3 className="font-retro-heavy text-sm uppercase text-black">
              4. FIRMA ELECTRÓNICA DIGITAL (.P12 / .PFX)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-black">
            {/* Carga de archivo .p12 */}
            <div className="space-y-2">
              <label className="block uppercase text-zinc-800 mb-1">
                Archivo de Certificado (.p12 o .pfx)
              </label>
              <div className="flex items-center gap-3">
                <label className="bg-pink-300 hover:bg-pink-400 border-3 border-black rounded-lg px-4 py-2.5 text-black font-black uppercase text-xs flex items-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_#000] active:translate-y-0.5 transition-all">
                  <Upload className="w-4 h-4 stroke-[3]" />
                  <span>Subir Firma Digital</span>
                  <input
                    type="file"
                    accept=".p12,.pfx"
                    onChange={handleSignatureUpload}
                    className="hidden"
                  />
                </label>
                {formData.firmaElectronicaBase64 ? (
                  <span className="bg-emerald-100 border-2 border-emerald-600 text-emerald-950 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-[11px] font-bold">
                    <Check className="w-4 h-4 text-emerald-700 stroke-[3]" />
                    {formData.firmaElectronicaNombre || 'Firma cargada'}
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-500 font-bold">
                    Sin archivo cargado
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">
                El archivo se almacena cifrado en la base de datos local para la firma automática de comprobantes.
              </p>
            </div>

            {/* Contraseña de la Firma */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Contraseña de la Firma Electrónica
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ingrese la clave de su certificado"
                  value={formData.firmaElectronicaClave || ''}
                  onChange={e => handleChange('firmaElectronicaClave', e.target.value)}
                  className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-retro-mono font-bold text-black focus:bg-white focus:outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-black"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECCIÓN 5: SERVIDOR DE CORREO SMTP (ENVÍO DE RIDE, XML Y NOTAS DE VENTA) */}
        <div className="bg-white border-4 border-black p-6 rounded-2xl shadow-[6px_6px_0px_0px_#000] space-y-5">
          <div className="border-b-3 border-black pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-300 border-2 border-black rounded-lg">
                <Mail className="w-5 h-5 text-black" />
              </span>
              <div>
                <h3 className="font-retro-heavy text-sm uppercase text-black">
                  5. SERVIDOR DE CORREO SMTP (ENVÍO DE RIDE, XML AUTORIZADO Y NOTAS DE VENTA)
                </h3>
                <p className="text-[10px] font-bold text-zinc-600 uppercase">
                  Configure su cuenta de correo para enviar directamente al cliente el PDF RIDE, el XML Autorizado y las Notas de Venta.
                </p>
              </div>
            </div>

            {/* Presets rápidos */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[9px] font-black uppercase text-zinc-500 mr-1">Ajuste rápido:</span>
              <button
                type="button"
                onClick={() =>
                  setFormData(prev => ({
                    ...prev,
                    smtpHost: 'smtp.gmail.com',
                    smtpPort: 465,
                    smtpSecure: true,
                  }))
                }
                className="bg-red-100 hover:bg-red-200 border-2 border-black rounded px-2 py-1 text-[10px] font-black uppercase text-black cursor-pointer shadow-[1px_1px_0px_0px_#000]"
              >
                Gmail (465 SSL)
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData(prev => ({
                    ...prev,
                    smtpHost: 'smtp.office365.com',
                    smtpPort: 587,
                    smtpSecure: false,
                  }))
                }
                className="bg-sky-100 hover:bg-sky-200 border-2 border-black rounded px-2 py-1 text-[10px] font-black uppercase text-black cursor-pointer shadow-[1px_1px_0px_0px_#000]"
              >
                Outlook / 365 (587)
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData(prev => ({
                    ...prev,
                    smtpHost: 'smtp.mail.yahoo.com',
                    smtpPort: 465,
                    smtpSecure: true,
                  }))
                }
                className="bg-purple-100 hover:bg-purple-200 border-2 border-black rounded px-2 py-1 text-[10px] font-black uppercase text-black cursor-pointer shadow-[1px_1px_0px_0px_#000]"
              >
                Yahoo (465 SSL)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-black">
            {/* Host SMTP */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Servidor SMTP (Host)
              </label>
              <input
                type="text"
                placeholder="Ej: smtp.gmail.com"
                value={formData.smtpHost || ''}
                onChange={e => handleChange('smtpHost', e.target.value)}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-retro-mono font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Puerto SMTP */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Puerto SMTP
              </label>
              <input
                type="number"
                placeholder="465 o 587"
                value={formData.smtpPort || 465}
                onChange={e => {
                  const p = parseInt(e.target.value, 10) || 465;
                  setFormData(prev => ({
                    ...prev,
                    smtpPort: p,
                    smtpSecure: p === 465,
                  }));
                }}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-retro-mono font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Seguridad SSL / STARTTLS */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Seguridad de Conexión
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleChange('smtpSecure', true);
                    handleChange('smtpPort', 465);
                  }}
                  className={`py-2.5 px-3 border-3 border-black rounded-lg font-black uppercase text-[10px] transition-all cursor-pointer ${
                    (formData.smtpSecure ?? true)
                      ? 'bg-emerald-300 text-black shadow-[2px_2px_0px_0px_#000]'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  🔒 SSL/TLS (465)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleChange('smtpSecure', false);
                    handleChange('smtpPort', 587);
                  }}
                  className={`py-2.5 px-3 border-3 border-black rounded-lg font-black uppercase text-[10px] transition-all cursor-pointer ${
                    formData.smtpSecure === false
                      ? 'bg-cyan-300 text-black shadow-[2px_2px_0px_0px_#000]'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  ⚡ STARTTLS (587)
                </button>
              </div>
            </div>

            {/* Usuario / Correo Emisor */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Correo Emisor (Usuario SMTP)
              </label>
              <input
                type="email"
                placeholder="Ej: tucorreo@gmail.com"
                value={formData.smtpUser || ''}
                onChange={e => handleChange('smtpUser', e.target.value)}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>

            {/* Contraseña SMTP / App Password */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Contraseña SMTP / Clave de Aplicación
              </label>
              <div className="relative">
                <input
                  type={showSmtpPass ? 'text' : 'password'}
                  placeholder="En Gmail use Contraseña de Aplicación (16 letras)"
                  value={formData.smtpPass || ''}
                  onChange={e => handleChange('smtpPass', e.target.value)}
                  className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-retro-mono font-bold text-black focus:bg-white focus:outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSmtpPass(!showSmtpPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-black"
                >
                  {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[9.5px] text-zinc-500 font-bold block mt-0.5">
                Si usa Gmail, active la verificación en 2 pasos y genere una "Contraseña de aplicación".
              </span>
            </div>

            {/* Nombre del Remitente */}
            <div>
              <label className="block uppercase text-zinc-800 mb-1">
                Nombre Visible del Remitente
              </label>
              <input
                type="text"
                placeholder="Ej: MOCCAPRICHO - Facturación Electrónica"
                value={formData.smtpFromName || ''}
                onChange={e => handleChange('smtpFromName', e.target.value)}
                className="w-full bg-yellow-50 border-3 border-black rounded-lg p-2.5 font-bold text-black focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Envío Automático + Probador SMTP */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t-2 border-dashed border-zinc-300">
            <div className="bg-amber-50 border-2 border-black rounded-xl p-3.5 flex items-center justify-between gap-3">
              <div>
                <span className="font-retro-heavy text-xs uppercase text-black block">
                  ⚡ Envío Automático al Cobrar en POS
                </span>
                <span className="text-[10px] font-bold text-zinc-700">
                  Si el cliente tiene correo registrado, envía automáticamente el RIDE + XML (Factura) o la Nota de Venta al finalizar el cobro.
                </span>
              </div>
              <input
                type="checkbox"
                checked={formData.smtpAutoSend ?? true}
                onChange={e => handleChange('smtpAutoSend', e.target.checked)}
                className="w-5 h-5 accent-black border-2 border-black rounded cursor-pointer shrink-0"
              />
            </div>

            <div className="bg-cyan-50 border-2 border-black rounded-xl p-3.5 space-y-2">
              <label className="block text-[10px] font-black uppercase text-black">
                📨 Probar Configuración SMTP (Enviar correo de prueba)
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Correo destino para prueba..."
                  value={testEmailRecipient}
                  onChange={e => setTestEmailRecipient(e.target.value)}
                  className="flex-1 bg-white border-2 border-black rounded-lg px-3 py-1.5 text-xs font-bold text-black focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isTestingSmtp}
                  onClick={async () => {
                    const dest = (testEmailRecipient || formData.smtpUser || formData.email || '').trim();
                    if (!dest || !dest.includes('@')) {
                      setSmtpTestFeedback({ success: false, message: 'Ingrese un correo destino válido para la prueba.' });
                      return;
                    }
                    setIsTestingSmtp(true);
                    setSmtpTestFeedback(null);
                    const res = await sendTestSmtpEmail(formData, dest);
                    setIsTestingSmtp(false);
                    setSmtpTestFeedback({
                      success: res.success,
                      message: res.success
                        ? `✅ ¡Correo de prueba enviado con éxito a ${dest}!`
                        : `❌ ${res.error || 'No se pudo enviar el correo de prueba.'}`,
                    });
                  }}
                  className="bg-black hover:bg-zinc-800 text-lime-400 border-2 border-black rounded-lg px-3.5 py-1.5 text-[11px] font-black uppercase cursor-pointer shrink-0 flex items-center gap-1.5"
                >
                  {isTestingSmtp ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-lime-400 border-t-transparent rounded-full animate-spin" />
                      <span>Enviando...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5" />
                      <span>Probar SMTP</span>
                    </>
                  )}
                </button>
              </div>
              {smtpTestFeedback && (
                <p className={`text-[10px] font-black ${smtpTestFeedback.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {smtpTestFeedback.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* BARRA DE ACCIONES INFERIOR */}
        <div className="bg-zinc-100 border-4 border-black p-5 rounded-2xl shadow-[6px_6px_0px_0px_#000] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportJson}
              className="bg-white hover:bg-zinc-100 border-3 border-black rounded-xl px-4 py-2 text-xs font-black uppercase text-black flex items-center gap-2 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Respaldo</span>
            </button>

            <label className="bg-white hover:bg-zinc-100 border-3 border-black rounded-xl px-4 py-2 text-xs font-black uppercase text-black flex items-center gap-2 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>Importar Respaldo</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto bg-emerald-400 hover:bg-emerald-500 border-4 border-black rounded-xl px-8 py-3 text-sm font-black uppercase text-black flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_#000] active:translate-y-0.5 cursor-pointer tracking-wider"
          >
            <Save className="w-5 h-5 stroke-[2.5]" />
            <span>GUARDAR CONFIGURACIÓN SRI</span>
          </button>
        </div>
      </form>
    </div>
  );
}
