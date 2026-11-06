/**
 * Servicio unificado de consulta de Cédula, RUC y Pasaporte ante los servicios oficiales del SRI
 * y Registro Civil de Ecuador.
 */

export interface SriConsultaResult {
  success: boolean;
  found: boolean;
  identificacion: string;
  nombre: string;
  nombreCompleto?: string;
  razonSocial?: string;
  nombreComercial?: string;
  tipoPersona?: string | null;
  tipoDocumento?: 'CEDULA' | 'RUC' | 'PASAPORTE';
  estado?: string;
  actividadEconomica?: string;
  regimen?: string;
  obligadoContabilidad?: string;
  fuente?: string;
  error?: string;
  rucData?: any;
}

export async function consultarIdentificacionSri(rawId: string): Promise<SriConsultaResult> {
  const cleanDigits = (rawId || '').trim().replace(/\D/g, '');
  const cleanId = (rawId || '').trim();

  if (!cleanId) {
    return {
      success: false,
      found: false,
      identificacion: '',
      nombre: '',
      error: 'Número de identificación requerido.',
    };
  }

  // Si estamos en entorno Electron, aprovechar el proceso principal de Node.js
  if (typeof window !== 'undefined' && (window as any).sqliteApi?.consultarSri) {
    try {
      const electronResult = await (window as any).sqliteApi.consultarSri(cleanId);
      if (electronResult && (electronResult.found || electronResult.success)) {
        return electronResult;
      }
    } catch (e) {
      console.warn('Fallo consulta vía Electron IPC, recurriendo a fetch directo:', e);
    }
  }

  const isCedula = cleanDigits.length === 10;
  const isRuc = cleanDigits.length === 13;
  const tipo = isCedula ? 'C' : isRuc ? 'R' : 'P';
  const targetId = isCedula || isRuc ? cleanDigits : cleanId.toUpperCase();
  const tipoDocumento: 'CEDULA' | 'RUC' | 'PASAPORTE' = isCedula ? 'CEDULA' : isRuc ? 'RUC' : 'PASAPORTE';

  // En el navegador no se debe enviar 'User-Agent' manualmente ya que la especificación de Fetch lo bloquea
  const isBrowserEnv = typeof window !== 'undefined';
  const standardHeaders: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
  };
  if (!isBrowserEnv) {
    standardHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  let foundName = '';
  let foundTipoPersona: string | null = null;
  let foundRucData: any = null;
  let fuenteUsada = '';

  // 1. Endpoint oficial de Persona del SRI (Intentar vía Vite proxy si está disponible, o directo)
  const personaUrls = [
    `/api/sri-persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${encodeURIComponent(targetId)}&tipoIdentificacion=${tipo}`,
    `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/Persona/obtenerPorTipoIdentificacion?numeroIdentificacion=${encodeURIComponent(targetId)}&tipoIdentificacion=${tipo}`
  ];

  for (const pUrl of personaUrls) {
    if (foundName) break;
    try {
      const resPersona = await fetch(pUrl, {
        headers: standardHeaders,
        signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
      });

      if (resPersona.status === 200) {
        const pData = await resPersona.json();
        if (pData && pData.nombreCompleto) {
          foundName = pData.nombreCompleto.trim();
          foundTipoPersona = pData.tipoPersona || null;
          fuenteUsada = 'SRI Persona';
          break;
        }
      }
    } catch (errPersona) {
      // Continuar al siguiente intento
    }
  }

  // 2. Catastro RUC consolidado del SRI
  if (!foundName || isRuc) {
    const rucNum = isCedula ? `${targetId}001` : targetId;
    const rucUrls = [
      `/api/sri-catastro/obtenerPorNumerosRuc?ruc=${encodeURIComponent(rucNum)}`,
      `https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${encodeURIComponent(rucNum)}`
    ];

    for (const rUrl of rucUrls) {
      try {
        const resRuc = await fetch(rUrl, {
          headers: standardHeaders,
          signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
        });

        if (resRuc.status === 200) {
          const list = await resRuc.json();
          const record = Array.isArray(list) ? list[0] : list;
          if (record && record.razonSocial) {
            if (!foundName) {
              foundName = record.razonSocial.trim();
              foundTipoPersona = record.tipoContribuyente || null;
              fuenteUsada = 'SRI Catastro RUC';
            }
            foundRucData = record;
            break;
          }
        }
      } catch (errRuc) {
        // Continuar al fallback
      }
    }
  }

  // 3. SRI Móvil Servicios de Deudas por Identificación
  if (!foundName) {
    const deudasUrls = [
      `/api/sri-deudas/porIdentificacion/${encodeURIComponent(targetId)}`,
      `https://srienlinea.sri.gob.ec/movil-servicios/api/v1.0/deudas/porIdentificacion/${encodeURIComponent(targetId)}`
    ];

    for (const dUrl of deudasUrls) {
      if (foundName) break;
      try {
        const resDeudas = await fetch(dUrl, {
          headers: standardHeaders,
          signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
        });

        if (resDeudas.status === 200) {
          const deudasData = await resDeudas.json();
          if (deudasData) {
            let extractedName = '';
            if (deudasData.contribuyente && typeof deudasData.contribuyente === 'object') {
              extractedName = deudasData.contribuyente.razonSocial || deudasData.contribuyente.nombreComercial || deudasData.contribuyente.denominacion || '';
            } else if (typeof deudasData.contribuyente === 'string') {
              extractedName = deudasData.contribuyente;
            } else {
              extractedName = deudasData.nombreCompleto || deudasData.razonSocial || '';
            }
            if (extractedName && typeof extractedName === 'string') {
              foundName = extractedName.trim();
              fuenteUsada = 'SRI Móvil';
              break;
            }
          }
        }
      } catch (errDeudas) {
        // Continuar al fallback
      }
    }
  }

  // 4. Fallback Registro Civil SECAP (para Cédulas)
  if (!foundName && isCedula) {
    try {
      const secapTarget = 'https://si.secap.gob.ec/sisecap/logeo_web/json/busca_persona_registro_civil.php';
      const secapRes = await fetch(secapTarget, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ documento: targetId, tipo: '1' }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined,
      });

      if (secapRes.ok) {
        const text = await secapRes.text();
        if (text && !text.trim().startsWith('<')) {
          try {
            const secapData = JSON.parse(text);
            if (secapData?.nombreCompleto) {
              foundName = secapData.nombreCompleto.trim();
            } else if (secapData?.nombre) {
              foundName = secapData.nombre.trim();
            } else if (secapData?.nombres && secapData?.apellidos) {
              foundName = `${secapData.apellidos} ${secapData.nombres}`.trim();
            }
            if (foundName) fuenteUsada = 'Registro Civil SECAP';
          } catch {}
        }
      }
    } catch (errSecap) {}
  }

  if (foundName) {
    const finalName = foundName.trim().toUpperCase();
    return {
      success: true,
      found: true,
      identificacion: targetId,
      nombre: finalName,
      nombreCompleto: finalName,
      razonSocial: foundRucData?.razonSocial || finalName,
      nombreComercial: foundRucData?.nombreComercial || '',
      tipoPersona: foundTipoPersona,
      tipoDocumento,
      estado: foundRucData?.estadoContribuyenteRuc || foundRucData?.estado || 'ACTIVO',
      actividadEconomica: foundRucData?.actividadEconomicaPrincipal || '',
      regimen: foundRucData?.regimen || '',
      obligadoContabilidad: foundRucData?.obligadoLlevarContabilidad || '',
      fuente: fuenteUsada,
      rucData: foundRucData,
    };
  }

  return {
    success: false,
    found: false,
    identificacion: targetId,
    nombre: '',
    tipoDocumento,
    error: `No se encontraron datos registrados en el SRI para ${targetId}.`,
  };
}
