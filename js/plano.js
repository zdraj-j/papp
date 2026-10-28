/* ============================================================================
   Plano — archivo de descuentos que se envía a gestión humana
   ----------------------------------------------------------------------------
   Formato por línea, tal como en el ejemplo entregado:

     cédula del EMPLEADO (12 dígitos, ceros a la izquierda) TAB
     concepto (3055)                                        TAB
     valor (12 dígitos, sin decimales ni signo)              TAB
     CRLF

   Sin encabezado. Un colaborador con varios vehículos genera varias líneas.
   ========================================================================== */
'use strict';

window.Plano = (function () {

  /** Arma el borrador del plano a partir de las líneas de un cobro. */
  function preparar(idCobro) {
    return Modelo.leerLineasCobro(idCobro).then(lineas => {
      if (!lineas.length) throw new Error('No se encontraron las líneas del cobro ' + idCobro + '.');

      const base = Modelo.obtener();
      const saldos = (base.saldos || []).filter(s => !s.aplicadoEn && s.restante < 0);

      const filas = lineas.map((l, i) => {
        const h = Modelo.buscarVehiculo(l.poliza, l.placa);
        const v = h ? h.vehiculo : null;
        const col = Modelo.colaborador(l.ccEmpleado);
        return {
          id: 'l' + i,
          ccEmpleado: U.cedula(l.ccEmpleado),
          nombreEmpleado: l.nombreEmpleado || (col ? col.nombre : ''),
          placa: l.placa,
          poliza: l.poliza,
          valorOriginal: l.prima || 0,
          valor: l.prima || 0,
          vehiculoId: v ? v.id : null,
          estadoVehiculo: v ? v.estado : 'desconocido',
          colaboradorRetirado: !!(col && col.estado === 'retirado'),
          ajustes: []
        };
      });

      const negativos = filas.filter(f => f.valor < 0);
      const avisos = [];

      filas.filter(f => f.colaboradorRetirado).forEach(f => {
        avisos.push({
          tipo: 'retirado', filaId: f.id,
          texto: f.nombreEmpleado + ' está marcado como retirado en la base y aparece con descuento por la placa ' + f.placa + '.'
        });
      });
      filas.filter(f => f.valor === 0).forEach(f => {
        avisos.push({ tipo: 'cero', filaId: f.id, texto: 'La placa ' + f.placa + ' viene en cero.' });
      });
      saldos.forEach(s => {
        avisos.push({
          tipo: 'saldo', texto: 'Quedó un saldo a favor de ' + U.dinero(Math.abs(s.restante)) +
            ' de ' + (s.nombreEmpleado || s.ccEmpleado) + ' desde ' + U.mes(s.cobro) + '.'
        });
      });

      return { idCobro, filas, negativos, avisos, saldos };
    });
  }

  /** Vehículos del mismo colaborador con valor positivo, para cruzar un saldo. */
  function destinosPara(prep, fila) {
    return prep.filas.filter(f => f.id !== fila.id && f.ccEmpleado === fila.ccEmpleado && f.valor > 0);
  }

  /**
   * Aplica las decisiones del usuario sobre los valores negativos.
   * decisiones: { <filaId>: { accion: 'cruzar' | 'eliminar', destino: <filaId> } }
   */
  function resolver(prep, decisiones) {
    const d = decisiones || {};
    const ajustes = [];
    const saldosNuevos = [];
    const eliminadas = new Set();

    prep.negativos.forEach(neg => {
      const dec = d[neg.id];
      if (!dec || !dec.accion) return;

      if (dec.accion === 'eliminar') {
        eliminadas.add(neg.id);
        ajustes.push({
          tipo: 'eliminada', filaId: neg.id, placa: neg.placa,
          cedula: neg.ccEmpleado, nombre: neg.nombreEmpleado, valor: neg.valor,
          texto: 'Se eliminó la línea de ' + neg.placa + ' (' + U.dinero(neg.valor) +
                 '): el colaborador no tiene otro vehículo donde cruzar el saldo.'
        });
        return;
      }

      const destino = prep.filas.find(f => f.id === dec.destino);
      if (!destino) return;

      const credito = Math.abs(neg.valor);
      const aplicado = Math.min(credito, destino.valor);
      destino.valor = Math.round((destino.valor - aplicado) * 100) / 100;
      destino.ajustes.push({ desde: neg.placa, monto: aplicado });
      eliminadas.add(neg.id);

      ajustes.push({
        tipo: 'cruce', filaId: neg.id, placa: neg.placa, destinoPlaca: destino.placa,
        cedula: neg.ccEmpleado, nombre: neg.nombreEmpleado, valor: neg.valor, aplicado,
        texto: 'Se cruzó el saldo a favor de ' + neg.placa + ' (' + U.dinero(neg.valor) +
               ') contra el descuento de ' + destino.placa + '.'
      });

      const restante = credito - aplicado;
      if (restante > 0) {
        saldosNuevos.push({
          id: U.id('s'), cobro: prep.idCobro, ccEmpleado: neg.ccEmpleado,
          nombreEmpleado: neg.nombreEmpleado, placa: neg.placa,
          restante: -restante, creado: U.ahoraISO(), aplicadoEn: null
        });
        ajustes.push({
          tipo: 'remanente', filaId: neg.id,
          texto: 'Quedó un remanente de ' + U.dinero(restante) + ' a favor de ' +
                 (neg.nombreEmpleado || neg.ccEmpleado) + ', guardado para el próximo mes.'
        });
      }
      if (destino.valor === 0) {
        ajustes.push({
          tipo: 'destino_cero', filaId: destino.id,
          texto: 'El descuento de ' + destino.placa + ' quedó en cero y no se incluye en el archivo.'
        });
      }
    });

    const finales = prep.filas.filter(f => !eliminadas.has(f.id) && f.valor > 0);
    const excluidasPorCero = prep.filas.filter(f => !eliminadas.has(f.id) && f.valor <= 0 && f.valorOriginal >= 0);

    return {
      finales, ajustes, saldosNuevos, excluidasPorCero,
      total: finales.reduce((s, f) => s + f.valor, 0),
      totalOriginal: prep.filas.reduce((s, f) => s + f.valorOriginal, 0),
      sinResolver: prep.negativos.filter(n => !eliminadas.has(n.id))
    };
  }

  /** Construye el texto del archivo plano. */
  function texto(filas, concepto) {
    const c = String(concepto || '3055');
    return filas.map(f =>
      U.pad(f.ccEmpleado, 12) + '\t' + c + '\t' + U.pad(Math.round(f.valor), 12) + '\t'
    ).join('\r\n') + '\r\n';
  }

  function nombreArchivo(idCobro) {
    return 'plano_' + idCobro + '.txt';
  }

  /** Guarda el plano en la carpeta y deja constancia en la base. */
  function registrar(idCobro, resultado, contenido) {
    const base = Modelo.obtener();
    const meta = base.cobros.find(c => c.id === idCobro);
    if (meta) {
      meta.planoGenerado = U.ahoraISO();
      meta.planoTotal = resultado.total;
      meta.planoLineas = resultado.finales.length;
      meta.planoAjustes = resultado.ajustes;
    }
    if (!base.saldos) base.saldos = [];
    // Si el plano se regenera, los remanentes del mismo mes se reemplazan en
    // vez de duplicarse.
    base.saldos = base.saldos.filter(s => s.cobro !== idCobro);
    resultado.saldosNuevos.forEach(s => base.saldos.push(s));

    Modelo.registrar('plano_generado',
      'Archivo plano de ' + U.mes(idCobro) + ': ' + resultado.finales.length +
      ' líneas por ' + U.dinero(resultado.total));

    return Almacen.escribirTexto('planos/' + nombreArchivo(idCobro), contenido)
      .catch(() => false)
      .then(() => Modelo.guardar());
  }

  return { preparar, destinosPara, resolver, texto, nombreArchivo, registrar };
})();
