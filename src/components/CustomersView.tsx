/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  UserCheck,
  Phone,
  Mail,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { CustomerDetails } from '../types';
import { validarDocumentoEcuatoriano } from './POSView';

interface CustomersViewProps {
  customers: CustomerDetails[];
  sales: { customer?: CustomerDetails; total: number; timestamp: string }[];
  onSaveCustomer: (customer: CustomerDetails) => void;
  onDeleteCustomer: (documentId: string) => void;
}

const emptyForm = (): CustomerDetails => ({
  name: '',
  documentId: '',
  phone: '',
  address: '',
  email: '',
});

export default function CustomersView({
  customers,
  sales,
  onSaveCustomer,
  onDeleteCustomer,
}: CustomersViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerDetails | null>(null);
  const [form, setForm] = useState<CustomerDetails>(emptyForm());
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [retroConfirm, setRetroConfirm] = useState<{
    message: string;
    onConfirm: () => void;
    confirmText?: string;
  } | null>(null);

  const [isSearchingCedula, setIsSearchingCedula] = useState(false);
  const [searchCedulaError, setSearchCedulaError] = useState<string | null>(null);
  const [isLoadedFromDb, setIsLoadedFromDb] = useState(false);
  const [loadedSource, setLoadedSource] = useState<'db' | 'sales' | 'rc' | null>(null);

  const lookupCedula = async (cedula: string) => {
    const cleanCedula = cedula.trim();
    if (!cleanCedula || cleanCedula === '9999999999') return;

    // 1. Search in local synchronized customers database first
    const existingDbCustomer = customers?.find(c => c.documentId.trim() === cleanCedula);
    if (existingDbCustomer) {
      setForm({
        name: existingDbCustomer.name,
        documentId: cleanCedula,
        phone: existingDbCustomer.phone || '',
        address: existingDbCustomer.address || '',
        email: existingDbCustomer.email || '',
      });
      setIsLoadedFromDb(true);
      setLoadedSource('db');
      setSearchCedulaError(null);
      setFormError('⚠️ El cliente ya existe en el directorio local. Los datos han sido cargados.');
      return;
    }

    // 2. Search in sales history as fallback
    const existingSaleCustomer = sales?.find(s => s.customer?.documentId.trim() === cleanCedula)?.customer;
    if (existingSaleCustomer) {
      setForm({
        name: existingSaleCustomer.name,
        documentId: cleanCedula,
        phone: existingSaleCustomer.phone || '',
        address: existingSaleCustomer.address || '',
        email: existingSaleCustomer.email || '',
      });
      setIsLoadedFromDb(true);
      setLoadedSource('sales');
      setSearchCedulaError(null);
      setFormError('⚠️ El cliente fue localizado en las ventas previas. Los datos han sido cargados.');
      return;
    }

    setIsLoadedFromDb(false);
    setLoadedSource(null);
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
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (e) {
        if (text && !text.includes('<html') && text.length < 150) {
          const name = text.trim();
          if (name) {
            setForm(prev => ({ ...prev, name: name.toUpperCase() }));
            setLoadedSource('rc');
            setSearchCedulaError(null);
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
          throw new Error(data.error || data.message || data.error_msg || 'Cédula no encontrada en Registro Civil');
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
          setForm(prev => ({ ...prev, name: foundName.trim().toUpperCase() }));
          setLoadedSource('rc');
          setSearchCedulaError(null);
        } else {
          throw new Error('No se pudo extraer el nombre del cliente');
        }
      }
    } catch (err: any) {
      console.warn('Consulta Registro Civil falló:', err);
      setSearchCedulaError(err.message || 'No se pudo consultar el Registro Civil. Ingrese el nombre manualmente.');
    } finally {
      setIsSearchingCedula(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const filteredCustomers = useMemo(() => {
    const rawList = customers || [];
    const uniqueMap = new Map<string, CustomerDetails>();
    for (const c of rawList) {
      if (!c) continue;
      const key = (c.documentId || '').trim();
      if (key) {
        uniqueMap.set(key, c);
      }
    }
    const uniqueList = Array.from(uniqueMap.values());
    const q = searchQuery.toLowerCase().trim();
    if (!q) return uniqueList;
    return uniqueList.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.documentId || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const getCustomerPurchases = (docId: string) =>
    (sales || []).filter((s) => s.customer?.documentId && s.customer.documentId.trim() === docId.trim());

  const openNewForm = () => {
    setEditingCustomer(null);
    setForm(emptyForm());
    setFormError('');
    setSearchCedulaError(null);
    setIsLoadedFromDb(false);
    setLoadedSource(null);
    setShowForm(true);
  };

  const openEditForm = (customer: CustomerDetails) => {
    setEditingCustomer(customer);
    setForm({ ...customer });
    setFormError('');
    setSearchCedulaError(null);
    setIsLoadedFromDb(true);
    setLoadedSource('db');
    setShowForm(true);
  };

  const handleFormChange = (field: keyof CustomerDetails, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed: CustomerDetails = {
      name: form.name.trim().toUpperCase(),
      documentId: form.documentId.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      email: form.email.trim(),
    };

    if (!trimmed.name) return setFormError('El nombre es obligatorio.');
    if (!trimmed.documentId) return setFormError('La cédula/RUC/Pasaporte es obligatorio.');

    const docValidation = validarDocumentoEcuatoriano(trimmed.documentId);
    if (!docValidation.valido)
      return setFormError(`Documento inválido: ${docValidation.mensaje}`);
    if (trimmed.documentId === '9999999999')
      return setFormError('No se puede registrar Consumidor Final como cliente.');

    if (trimmed.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
      return setFormError('Ingrese un formato de correo electrónico válido (ejemplo@correo.com).');
    }

    // Check for duplicate if creating new
    if (!editingCustomer) {
      const existing = (customers || []).find(
        (c) => c.documentId.trim() === trimmed.documentId
      );
      if (existing) {
        setRetroConfirm({
          message: `El cliente con documento "${existing.documentId}" (${existing.name}) ya existe en la base de datos. ¿Desea actualizar sus datos con la información ingresada?`,
          confirmText: '✅ Actualizar Cliente',
          onConfirm: () => {
            onSaveCustomer(trimmed);
            showSuccess(`Cliente ${trimmed.name} actualizado correctamente.`);
            setShowForm(false);
            setEditingCustomer(null);
            setForm(emptyForm());
            setRetroConfirm(null);
          }
        });
        return;
      }
    }

    onSaveCustomer(trimmed);
    showSuccess(
      editingCustomer
        ? `Cliente ${trimmed.name} actualizado correctamente.`
        : `Cliente ${trimmed.name} registrado correctamente.`
    );
    setShowForm(false);
    setEditingCustomer(null);
    setForm(emptyForm());
  };

  const handleDelete = (customer: CustomerDetails) => {
    const purchases = getCustomerPurchases(customer.documentId);
    const msg =
      purchases.length > 0
        ? `¿Eliminar a ${customer.name}? Tiene ${purchases.length} compra(s) registrada(s). Sus datos se borrarán del directorio, pero las ventas se conservan.`
        : `¿Eliminar a ${customer.name}? Esta acción no se puede deshacer.`;
    setRetroConfirm({
      message: msg,
      confirmText: '🗑️ Eliminar Cliente',
      onConfirm: () => {
        onDeleteCustomer(customer.documentId.trim());
        showSuccess(`Cliente ${customer.name} eliminado.`);
        setRetroConfirm(null);
      },
    });
  };

  const docVal = validarDocumentoEcuatoriano(form.documentId);
  const isDocValid =
    form.documentId.trim() !== '' &&
    docVal.valido &&
    form.documentId !== '9999999999';

  return (
    <div className="space-y-6" id="customers-view">
      {/* Header */}
      <div className="bg-white border-4 border-black rounded-xl p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-retro-heavy text-base uppercase text-black flex items-center gap-2">
              <Users className="w-5 h-5 stroke-[2.5]" />
              DIRECTORIO DE CLIENTES
            </h2>
            <p className="text-xs font-bold text-zinc-600 mt-0.5 uppercase">
              Registra y gestiona tus clientes frecuentes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right text-xs font-black uppercase text-black bg-yellow-100 border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] rounded">
              {customers.length} clientes
            </div>
            <button
              onClick={openNewForm}
              className="flex items-center gap-2 bg-lime-300 hover:bg-lime-400 border-3 border-black text-black font-black text-xs uppercase px-4 py-2 rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              NUEVO CLIENTE
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-black stroke-[2.5]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, cedula, telefono o correo..."
            className="w-full pl-9 pr-4 py-2 border-3 border-black bg-pink-50 rounded-lg text-xs font-bold text-black focus:outline-none focus:bg-white placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Success Toast */}
      {successMsg && (
        <div className="bg-lime-200 border-3 border-black text-black font-black text-xs uppercase px-4 py-3 rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2">
          <UserCheck className="w-4 h-4 stroke-[3]" />
          {successMsg}
        </div>
      )}

      {/* Customers Table */}
      <div className="bg-white border-4 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-10 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-zinc-300 stroke-[1.5]" />
            <p className="uppercase font-black text-black text-sm">
              {searchQuery ? 'No se encontraron clientes' : 'Aun no hay clientes registrados'}
            </p>
            <p className="text-xs text-zinc-500 mt-1 font-bold">
              {searchQuery
                ? 'Intenta con otro termino de busqueda'
                : 'Los clientes se guardan al hacer una venta con datos o desde el boton Nuevo Cliente'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-yellow-300 border-b-3 border-black">
                  <th className="text-left font-black uppercase px-4 py-3 tracking-wide">Nombre / Razon Social</th>
                  <th className="text-left font-black uppercase px-4 py-3 tracking-wide">Cedula / RUC / Pasaporte</th>
                  <th className="text-left font-black uppercase px-4 py-3 tracking-wide">Telefono</th>
                  <th className="text-left font-black uppercase px-4 py-3 tracking-wide hidden lg:table-cell">Correo</th>
                  <th className="text-left font-black uppercase px-4 py-3 tracking-wide hidden xl:table-cell">Direccion</th>
                  <th className="text-center font-black uppercase px-4 py-3 tracking-wide">Compras</th>
                  <th className="text-center font-black uppercase px-4 py-3 tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-black/10">
                {filteredCustomers.map((customer, idx) => {
                  const purchases = getCustomerPurchases(customer.documentId);
                  const totalSpent = purchases.reduce((sum, s) => sum + s.total, 0);
                  return (
                    <tr key={customer.documentId + idx} className="hover:bg-yellow-50 transition-colors">
                      <td className="px-4 py-3 font-black text-black">{customer.name}</td>
                      <td className="px-4 py-3 font-retro-mono font-bold text-black">
                        {customer.documentId}
                        <div className="text-[9px] text-zinc-500 font-bold uppercase">
                          {validarDocumentoEcuatoriano(customer.documentId).tipo}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-black">
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-zinc-400 shrink-0" />
                          {customer.phone || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-black hidden lg:table-cell">
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{customer.email || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-black hidden xl:table-cell">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{customer.address || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {purchases.length > 0 ? (
                          <div>
                            <span className="bg-cyan-200 border-2 border-black text-black font-black text-[10px] px-2 py-0.5 rounded shadow-[1px_1px_0px_0px_#000]">
                              {purchases.length} nota{purchases.length !== 1 ? 's' : ''}
                            </span>
                            <div className="text-[9px] text-zinc-600 font-bold mt-0.5">
                              ${totalSpent.toFixed(2)} total
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 font-bold">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openEditForm(customer)}
                            className="bg-cyan-200 hover:bg-cyan-300 border-2 border-black text-black p-1.5 rounded shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5 transition-all cursor-pointer"
                            title="Editar cliente"
                          >
                            <Edit2 className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                          <button
                            onClick={() => handleDelete(customer)}
                            className="bg-rose-200 hover:bg-rose-300 border-2 border-black text-black p-1.5 rounded shadow-[1.5px_1.5px_0px_0px_#000] active:translate-y-0.5 transition-all cursor-pointer"
                            title="Eliminar cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-4 border-black rounded-xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md overflow-hidden">
            <div className="bg-fuchsia-300 border-b-4 border-black p-4 flex items-center justify-between">
              <h3 className="font-retro-heavy text-sm uppercase text-black flex items-center gap-2">
                <UserCheck className="w-4 h-4 stroke-[2.5]" />
                {editingCustomer ? 'EDITAR CLIENTE' : 'NUEVO CLIENTE'}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="bg-white hover:bg-zinc-100 border-2 border-black rounded p-1 shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 cursor-pointer"
              >
                <X className="w-4 h-4 text-black" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="bg-rose-100 border-2 border-rose-500 text-rose-900 font-black text-[10px] uppercase p-3 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-700 mb-1">
                  Cédula, RUC o Pasaporte <span className="text-rose-600">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={form.documentId}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleFormChange('documentId', val);
                      if (val.trim().length >= 10 && !editingCustomer) {
                        lookupCedula(val);
                      }
                    }}
                    onBlur={() => {
                      if (form.documentId.trim().length >= 10 && !editingCustomer && !form.name) {
                        lookupCedula(form.documentId);
                      }
                    }}
                    placeholder="Ej: 1701234567"
                    disabled={!!editingCustomer}
                    className={`flex-1 px-3 py-2 border-3 rounded-lg text-xs font-retro-mono font-bold text-black focus:outline-none ${
                      editingCustomer
                        ? 'bg-zinc-100 border-zinc-400 cursor-not-allowed'
                        : isDocValid
                        ? 'bg-emerald-50 border-emerald-500'
                        : form.documentId.trim()
                        ? 'bg-rose-50 border-rose-500'
                        : 'bg-yellow-50 border-black focus:bg-white'
                    }`}
                  />
                  {!editingCustomer && (
                    <button
                      type="button"
                      onClick={() => lookupCedula(form.documentId)}
                      disabled={isSearchingCedula || !form.documentId.trim()}
                      className="bg-cyan-300 hover:bg-cyan-400 border-3 border-black rounded-lg px-3 py-2 text-black font-black flex items-center justify-center cursor-pointer shadow-[2px_2px_0px_0px_#000] active:translate-y-0.5 transition-all"
                      title="Buscar en Base de Datos y Registro Civil"
                    >
                      {isSearchingCedula ? (
                        <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <Search className="w-4 h-4 stroke-[3]" />
                      )}
                    </button>
                  )}
                </div>

                {isSearchingCedula && (
                  <p className="text-[9.5px] font-black text-cyan-800 uppercase tracking-wide mt-1 animate-pulse">
                    🔍 Consultando Registro Civil / Base de datos...
                  </p>
                )}
                {searchCedulaError && (
                  <p className="text-[9.5px] font-bold text-rose-600 mt-1 uppercase">
                    ⚠️ {searchCedulaError}
                  </p>
                )}
                {form.documentId.trim() && !isSearchingCedula && (
                  <p className={`text-[9px] font-bold mt-0.5 ${isDocValid ? 'text-emerald-700' : 'text-rose-600'}`}>
                    [{docVal.tipo}] {docVal.mensaje}
                  </p>
                )}
                {editingCustomer && (
                  <p className="text-[9px] text-zinc-500 font-bold mt-0.5">
                    El documento no se puede cambiar. Elimine y cree uno nuevo si es necesario.
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-black uppercase text-zinc-700">
                    Nombre o Razón Social <span className="text-rose-600">*</span>
                  </label>
                  {loadedSource === 'db' && (
                    <span className="bg-emerald-100 text-emerald-800 text-[8.5px] font-black px-1.5 py-0.5 rounded border border-emerald-400 uppercase tracking-wide">
                      💾 Base de Datos Local
                    </span>
                  )}
                  {loadedSource === 'sales' && (
                    <span className="bg-amber-100 text-amber-800 text-[8.5px] font-black px-1.5 py-0.5 rounded border border-amber-400 uppercase tracking-wide">
                      🧾 Historial Ventas
                    </span>
                  )}
                  {loadedSource === 'rc' && (
                    <span className="bg-cyan-100 text-cyan-800 text-[8.5px] font-black px-1.5 py-0.5 rounded border border-cyan-400 uppercase tracking-wide">
                      🏛️ Registro Civil API
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  placeholder="Ej: JUAN PEREZ GUTIERREZ"
                  className="w-full px-3 py-2 border-3 border-black bg-yellow-50 rounded-lg text-xs font-bold text-black focus:outline-none focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-zinc-700 mb-1">Telefono</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => handleFormChange('phone', e.target.value)}
                    placeholder="0999999999"
                    className="w-full px-3 py-2 border-3 border-black bg-yellow-50 rounded-lg text-xs font-bold text-black focus:outline-none focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-zinc-700 mb-1">Direccion</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => handleFormChange('address', e.target.value)}
                    placeholder="S/N"
                    className="w-full px-3 py-2 border-3 border-black bg-yellow-50 rounded-lg text-xs font-bold text-black focus:outline-none focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-zinc-700 mb-1">
                  Correo Electronico
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleFormChange('email', e.target.value)}
                  placeholder="cliente@ejemplo.com"
                  className="w-full px-3 py-2 border-3 border-black bg-yellow-50 rounded-lg text-xs font-bold text-black focus:outline-none focus:bg-white"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-white hover:bg-zinc-100 border-3 border-black text-black font-black text-xs uppercase py-2.5 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-lime-300 hover:bg-lime-400 border-3 border-black text-black font-black text-xs uppercase py-2.5 rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4 stroke-[2.5]" />
                  {editingCustomer ? 'GUARDAR CAMBIOS' : 'REGISTRAR CLIENTE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── RETRO CONFIRM MODAL ── */}
      {retroConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-[100]">
          <div className="bg-white border-4 border-black rounded-xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-sm overflow-hidden">
            <div className="bg-rose-300 border-b-4 border-black px-5 py-3">
              <p className="font-retro-heavy text-sm uppercase text-black">⚠️ CONFIRMAR ACCION</p>
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
                  className={`flex-1 border-3 border-black text-black font-black text-xs uppercase py-2.5 rounded-lg shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer ${
                    retroConfirm.confirmText?.includes('Actualizar')
                      ? 'bg-lime-300 hover:bg-lime-400'
                      : 'bg-rose-300 hover:bg-rose-400'
                  }`}
                >
                  {retroConfirm.confirmText || 'Aceptar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
