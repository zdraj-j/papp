/* ============================================================================
   Cobro — lectura del pre-cobro mensual, conciliación y aplicación a la base
   ========================================================================== */
'use strict';

window.Cobro = (function () {

  /* ------------------------------------------- reconocimiento de columnas */

  const ALIAS = [
    { campo: 'consecutivo',     etiqueta: 'No.',                  claves: ['NO', 'NO.', 'ITEM', 'CONSECUTIVO'] },
    { campo: 'poliza',          etiqueta: 'No. de póliza',        claves: ['NO POLIZA', 'N POLIZA', 'NUMERO DE POLIZA', 'NUMERO POLIZA', 'POLIZA', 'CERTIFICADO'] },
    { campo: 'placa',           etiqueta: 'Placa',                claves: ['PLACA', 'PLACAS'] },
    { campo: 'ccAsegurado',     etiqueta: 'Cédula del asegurado', claves: ['CC ASEGURADO', 'CEDULA ASEGURADO', 'DOCUMENTO ASEGURADO', 'CC DEL ASEGURADO'] },
    { campo: 'nombreAsegurado', etiqueta: 'Nombre del asegurado', claves: ['NOMBRE ASEGURADO', 'NOMBRE DEL ASEGURADO', 'ASEGURADO'] },
    { campo: 'estadoAsegurado', etiqueta: 'Estado',               claves: ['ESTADO'] },
    { campo: 'ccEmpleado',      etiqueta: 'Cédula del empleado',  claves: ['CC EMPLEADO', 'CEDULA EMPLEADO', 'DOCUMENTO EMPLEADO', 'CC DEL EMPLEADO'] },
    { campo: 'nombreEmpleado',  etiqueta: 'Nombre del empleado',  claves: ['NOMBRE DEL EMPLEADO', 'NOMBRE EMPLEADO', 'EMPLEADO'] },
    { campo: 'beneficiario',    etiqueta: 'Beneficiario',         claves: ['BENEFICIARIO', 'BENEFICIARIO ONEROSO'] },
    { campo: 'clase',           etiqueta: 'Clase',                claves: ['CLASE', 'TIPO'] },
    { campo: 'marca',           etiqueta: 'Marca',                claves: ['MARCA'] },
    { campo: 'modelo',          etiqueta: 'Modelo',               claves: ['MODELO', 'ANO', 'AÑO'] }
  ];

  /** Campos que se comparan contra la base (la prima va aparte). */
  const COMPARABLES = ALIAS.filter(a => a.campo !== 'consecutivo' && a.campo !== 'poliza');

  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
    'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  function encabezadoNormalizado(v) {
    return U.norm(v).replace(/\./g, '').replace(/\s+/g, ' ').trim();
  }

  /* ------------------------------------------------------------- lectura */

  function leerArchivo(file) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      lector.onload = e => {
        try {
          const libro = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          const hoja = libro.SheetNames[0];
          const filas = XLSX.utils.sheet_to_json(libro.Sheets[hoja], {
            header: 1, blankrows: true, defval: null, raw: true
          });
          resolve(interpretar(filas, file.name, hoja));
        } catch (err) {
          reject(new Error('El archivo no se pudo abrir como libro de Excel.'));
        }
      };
      lector.readAsArrayBuffer(file);
    });
  }

  function interpretar(filas, nombreArchivo, nombreHoja) {
    let filaEnc = -1, mapa = null, colPrima = -1, tituloPrima = '';

    for (let i = 0; i < Math.min(filas.length, 40); i++) {
      const fila = filas[i] || [];
      const hallado = {};
      let prima = -1, titulo = '', aciertos = 0;

      fila.forEach((celda, j) => {
        const texto = encabezadoNormalizado(celda);
        if (!texto) return;
        if (texto.indexOf('PRIMA') !== -1) {
          prima = j; titulo = String(celda).replace(/\s+/g, ' ').trim(); return;
        }
        for (const alias of ALIAS) {
          if (alias.claves.indexOf(texto) !== -1 && hallado[alias.campo] === undefined) {
            hallado[alias.campo] = j; aciertos++; break;
          }
        }
      });

      if (aciertos >= 4 && hallado.placa !== undefined) {
        filaEnc = i; mapa = hallado; colPrima = prima; tituloPrima = titulo;
        break;
      }
    }

    if (filaEnc === -1) {
      throw new Error('No se encontró la fila de encabezados en la primera hoja. ' +
        'Se esperan columnas como PLACA, NOMBRE ASEGURADO y BENEFICIARIO.');
    }
    if (colPrima === -1) throw new Error('No se encontró la columna de la prima mensual.');

    const cabecera = [];
    for (let i = 0; i < filaEnc; i++) {
      (filas[i] || []).forEach(c => {
        const t = c === null || c === undefined ? '' : String(c).replace(/\s+/g, ' ').trim();
        if (t.length > 3) cabecera.push(t);
      });
    }

    const lineas = [];
    let totalDeclarado = null, vacias = 0;

    for (let i = filaEnc + 1; i < filas.length; i++) {
      const fila = filas[i] || [];
      const textoFila = fila.map(c => (c === null ? '' : String(c))).join(' ');

      if (/TOTAL/i.test(textoFila) && lineas.length > 0) {
        totalDeclarado = U.aNumero(fila[colPrima]);
        if (totalDeclarado === null) {
          for (let j = fila.length - 1; j >= 0; j--) {
            const n = U.aNumero(fila[j]);
            if (n !== null) { totalDeclarado = n; break; }
          }
        }
        break;
      }

      const leer = campo => (mapa[campo] === undefined ? null : fila[mapa[campo]]);
      const poliza = leer('poliza'), placa = leer('placa');
      if (!U.clave(poliza) && !U.clave(placa)) {
        if (++vacias > 15) break;
        continue;
      }
      vacias = 0;

      const r = { filaExcel: i + 1 };
      ALIAS.forEach(a => {
        let v = leer(a.campo);
        if (v !== null && v !== undefined) v = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v;
        r[a.campo] = v;
      });
      r.ccEmpleado = U.cedula(r.ccEmpleado);
      r.ccAsegurado = U.cedula(r.ccAsegurado);
      r.placa = U.clave(r.placa);
      r.poliza = String(r.poliza === null || r.poliza === undefined ? '' : r.poliza).trim();
      r.prima = U.aNumero(fila[colPrima]);
      lineas.push(r);
    }

    const periodo = cabecera.find(t => /PERIODO|COBRO MENSUAL/i.test(t)) || '';
    const factura = (cabecera.find(t => /^FACTURA/i.test(t)) || '').replace(/^FACTURA\s*:?\s*/i, '').trim();
    const vigencia = cabecera.find(t => /VIGENCIA/i.test(t)) || '';
    const numeroPoliza = (cabecera.find(t => /^POLIZA\s*:/i.test(t)) || '').replace(/^POLIZA\s*:?\s*/i, '').trim();

    return {
      nombreArchivo, nombreHoja, cabecera, lineas, tituloPrima, totalDeclarado,
      periodo, factura, vigencia, numeroPoliza,
      id: idDesdePeriodo(periodo),
      etiqueta: factura ? 'Cobro No. ' + factura : (tituloPrima || 'Cobro'),
      suma: lineas.reduce((s, r) => s + (r.prima || 0), 0)
    };
  }

  /**
   * "PERIODO 01 DE AGOSTO AL 01 DE SEPTIEMBRE DE 2026" → "2026-08".
   * Toma el primer mes que aparece en el texto, no el primero del calendario:
   * de lo contrario un periodo de diciembre a enero se leería como enero.
   */
  function idDesdePeriodo(texto) {
    const t = U.norm(texto);
    if (!t) return '';

    let mejor = -1, posMes = -1;
    MESES.forEach((m, i) => {
      const p = t.indexOf(m);
      if (p !== -1 && (posMes === -1 || p < posMes)) { posMes = p; mejor = i; }
    });
    if (mejor === -1) return '';

    // El año que acompaña a ese mes: el primero que aparezca después de él.
    let anio = null;
    const re = /\b(20\d\d)\b/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (m.index > posMes) { anio = m[1]; break; }
      if (anio === null) anio = m[1];
    }
    return (anio || new Date().getFullYear()) + '-' + U.pad(mejor + 1, 2);
  }

  /* ---------------------------------------------------------- conciliación */

  function conciliar(lectura, opciones) {
    const tolerancia = (opciones && opciones.tolerancia) || 0;
    const usados = new Set();

    const nuevos = [], cambiosDatos = [], cambiosPrima = [], negativos = [], sinNovedad = [];
    const pendientes = Modelo.movimientosPendientes();

    lectura.lineas.forEach(linea => {
      const hallazgo = Modelo.buscarVehiculo(linea.poliza, linea.placa);

      if (linea.prima !== null && linea.prima < 0) {
        negativos.push({ linea, vehiculo: hallazgo ? hallazgo.vehiculo : null });
      }

      if (!hallazgo) {
        const mov = pendientes.find(m => m.tipo === 'inclusion' &&
          (U.clave(m.placa) === linea.placa ||
           (!U.clave(m.placa) && U.cedula(m.cedulaEmpleado) === linea.ccEmpleado)));
        nuevos.push({ linea, movimiento: mov || null });
        return;
      }

      const v = hallazgo.vehiculo;
      usados.add(v.id);

      const cambios = [];
      COMPARABLES.forEach(c => {
        const esClave = c.campo === 'ccAsegurado' || c.campo === 'ccEmpleado' ||
                        c.campo === 'placa' || c.campo === 'modelo';
        const antes = esClave ? U.clave(v[c.campo]) : U.norm(v[c.campo]);
        const ahora = esClave ? U.clave(linea[c.campo]) : U.norm(linea[c.campo]);
        if (antes !== ahora) {
          cambios.push({ campo: c.campo, etiqueta: c.etiqueta, antes: v[c.campo], despues: linea[c.campo] });
        }
      });

      if (U.clave(v.poliza) !== U.clave(linea.poliza)) {
        cambios.push({ campo: 'poliza', etiqueta: 'No. de póliza', antes: v.poliza, despues: linea.poliza });
      }

      const diferencia = Math.round(((linea.prima || 0) - (v.primaActual || 0)) * 100) / 100;
      const menor = diferencia !== 0 && Math.abs(diferencia) <= tolerancia + 0.001;

      if (cambios.length) {
        const movBen = cambios.some(c => c.campo === 'beneficiario')
          ? pendientes.find(m => m.tipo === 'cambio_beneficiario' && m.vehiculoId === v.id)
          : null;
        cambiosDatos.push({ vehiculo: v, linea, cambios, movimiento: movBen || null, via: hallazgo.via });
      }

      if (diferencia !== 0 && !menor) {
        const esperado = v.estado === 'en_exclusion';
        cambiosPrima.push({
          vehiculo: v, linea, antes: v.primaActual, ahora: linea.prima, diferencia, esperado,
          motivo: esperado ? 'Último pago esperado tras la exclusión' : ''
        });
      }

      if (!cambios.length && (diferencia === 0 || menor)) sinNovedad.push({ vehiculo: v, linea });
    });

    // Vehículos de la base que no vinieron en este cobro
    const faltantes = Modelo.vehiculos()
      .filter(v => v.estado !== 'excluido' && !usados.has(v.id))
      .map(v => ({
        vehiculo: v,
        movimiento: pendientes.find(m => m.tipo === 'exclusion' && m.vehiculoId === v.id) || null
      }));

    return {
      lectura, nuevos, faltantes, cambiosDatos, cambiosPrima, negativos, sinNovedad,
      tolerancia,
      totales: {
        lineas: lectura.lineas.length,
        suma: lectura.suma,
        declarado: lectura.totalDeclarado,
        baseAnterior: Modelo.vehiculos().filter(v => v.estado !== 'excluido')
          .reduce((s, v) => s + (v.primaActual || 0), 0)
      }
    };
  }

  /* ----------------------------------------------------------- aplicación */

  /**
   * Vuelca el cobro sobre la base: crea los vehículos nuevos, marca los que
   * salieron, actualiza datos y primas, y cierra los movimientos que el cobro
   * confirma. Devuelve un conteo de lo que hizo.
   */
  function aplicar(conc, decisiones) {
    const d = decisiones || {};
    const lectura = conc.lectura;
    const idCobro = d.id || lectura.id;
    const hechos = { creados: 0, actualizados: 0, excluidos: 0, movimientos: 0 };

    // 1. Vehículos nuevos
    conc.nuevos.forEach(n => {
      if (d.omitirNuevos && d.omitirNuevos.indexOf(n.linea.placa) !== -1) return;
      const v = Modelo.crearVehiculo({
        poliza: n.linea.poliza, placa: n.linea.placa,
        ccAsegurado: n.linea.ccAsegurado, nombreAsegurado: n.linea.nombreAsegurado,
        estadoAsegurado: n.linea.estadoAsegurado,
        ccEmpleado: n.linea.ccEmpleado, nombreEmpleado: n.linea.nombreEmpleado,
        beneficiario: n.linea.beneficiario, clase: n.linea.clase,
        marca: n.linea.marca, modelo: n.linea.modelo,
        estado: 'vigente', primaActual: n.linea.prima, primaDesde: idCobro
      });
      v.historial[idCobro] = n.linea.prima;
      hechos.creados++;

      if (n.movimiento) {
        Modelo.actualizarMovimiento(n.movimiento.id, {
          estado: 'materializado', vehiculoId: v.id, cobroMaterializado: idCobro
        });
        hechos.movimientos++;
      } else {
        Modelo.crearMovimiento({
          tipo: 'inclusion', vehiculoId: v.id, placa: v.placa,
          cedulaEmpleado: v.ccEmpleado, nombreEmpleado: v.nombreEmpleado,
          fechaEfectiva: idCobro + '-01', estado: 'materializado', cobroMaterializado: idCobro,
          observacion: 'Detectada al importar el cobro, sin registro previo en la app.'
        });
        hechos.movimientos++;
      }
    });

    // 2. Cambios de datos
    conc.cambiosDatos.forEach(c => {
      const cambios = {};
      c.cambios.forEach(x => { cambios[x.campo] = x.despues; });
      Modelo.actualizarVehiculo(c.vehiculo.id, cambios, 'Actualizado desde el cobro ' + idCobro);
      hechos.actualizados++;
      if (c.movimiento) {
        Modelo.actualizarMovimiento(c.movimiento.id, { estado: 'materializado', cobroMaterializado: idCobro });
        hechos.movimientos++;
      }
    });

    // 3. Prima e historial de todas las líneas presentes
    lectura.lineas.forEach(linea => {
      const h = Modelo.buscarVehiculo(linea.poliza, linea.placa);
      if (!h) return;
      const v = h.vehiculo;
      v.historial[idCobro] = linea.prima;
      v.primaActual = linea.prima;
      v.actualizado = U.ahoraISO();

      // Un vehículo en exclusión que aparece está recibiendo su último pago.
      if (v.estado === 'en_exclusion') {
        v.estado = 'excluido';
        v.excluidoEn = idCobro;
        const mov = Modelo.movimientos({ tipo: 'exclusion', vehiculoId: v.id })
          .find(m => m.estado === 'pendiente');
        if (mov) {
          Modelo.actualizarMovimiento(mov.id, { estado: 'materializado', cobroMaterializado: idCobro });
          hechos.movimientos++;
        }
      }
    });

    // 4. Vehículos que ya no vinieron
    conc.faltantes.forEach(f => {
      const v = f.vehiculo;
      if (v.estado === 'en_exclusion') {
        // Salió sin último cobro: queda excluido del todo.
        Modelo.actualizarVehiculo(v.id, { estado: 'excluido', excluidoEn: idCobro }, 'Dejó de aparecer en el cobro ' + idCobro);
      } else {
        Modelo.actualizarVehiculo(v.id, { estado: 'excluido', excluidoEn: idCobro }, 'Dejó de aparecer en el cobro ' + idCobro);
        if (!f.movimiento) {
          Modelo.crearMovimiento({
            tipo: 'exclusion', vehiculoId: v.id, placa: v.placa,
            cedulaEmpleado: v.ccEmpleado, nombreEmpleado: v.nombreEmpleado,
            fechaEfectiva: idCobro + '-01', estado: 'materializado', cobroMaterializado: idCobro,
            observacion: 'Dejó de aparecer en el cobro sin registro previo en la app.'
          });
          hechos.movimientos++;
        }
      }
      if (f.movimiento) {
        Modelo.actualizarMovimiento(f.movimiento.id, { estado: 'materializado', cobroMaterializado: idCobro });
        hechos.movimientos++;
      }
      hechos.excluidos++;
    });

    // 5. Metadatos del cobro
    const base = Modelo.obtener();
    const previo = base.cobros.findIndex(c => c.id === idCobro);
    const meta = {
      id: idCobro,
      etiqueta: lectura.etiqueta,
      periodo: lectura.periodo,
      factura: lectura.factura,
      archivo: lectura.nombreArchivo,
      importadoEn: U.ahoraISO(),
      aplicadoEn: U.ahoraISO(),
      totalDeclarado: lectura.totalDeclarado,
      totalLineas: lectura.suma,
      registros: lectura.lineas.length,
      negativos: conc.negativos.length,
      planoGenerado: null
    };
    if (previo === -1) base.cobros.push(meta);
    else base.cobros[previo] = Object.assign(base.cobros[previo], meta);

    if (lectura.vigencia && !base.poliza.vigenciaDesde) base.poliza.vigenciaTexto = lectura.vigencia;
    if (lectura.numeroPoliza) base.poliza.numero = lectura.numeroPoliza;

    Modelo.registrar('cobro_aplicado',
      'Se aplicó el ' + meta.etiqueta + ' (' + U.mes(idCobro) + ')',
      hechos);

    return Modelo.guardarLineasCobro(idCobro, lectura.lineas)
      .then(() => Modelo.guardar())
      .then(() => hechos);
  }

  return { leerArchivo, conciliar, aplicar, ALIAS, COMPARABLES, idDesdePeriodo };
})();
