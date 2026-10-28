/* ============================================================================
   Modelo — la base de datos de la póliza
   ========================================================================== */
'use strict';

window.Modelo = (function () {

  const RUTA_BASE = 'base.json';
  const VERSION = 1;

  const TIPOS_MOVIMIENTO = {
    inclusion:            { etiqueta: 'Inclusión de vehículo',    color: 'alta' },
    exclusion:            { etiqueta: 'Exclusión de vehículo',    color: 'baja' },
    cambio_beneficiario:  { etiqueta: 'Cambio de beneficiario',   color: 'dato' },
    siniestro:            { etiqueta: 'Siniestro',                color: 'aviso' },
    cambio_vehiculo:      { etiqueta: 'Cambio de vehículo',       color: 'dato' },
    correccion:           { etiqueta: 'Corrección de datos',      color: 'dato' },
    retiro_colaborador:   { etiqueta: 'Retiro del colaborador',   color: 'baja' },
    reactivacion:         { etiqueta: 'Reactivación',             color: 'alta' }
  };

  const ESTADOS_MOVIMIENTO = {
    pendiente:     'Pendiente de verse en el cobro',
    materializado: 'Materializado en el cobro',
    no_aplicado:   'No aplicado por la aseguradora',
    cerrado:       'Cerrado'
  };

  const ESTADOS_VEHICULO = {
    vigente:      'Vigente',
    en_exclusion: 'En exclusión',
    excluido:     'Excluido'
  };

  let base = null;
  let pendienteGuardar = null;
  const oyentes = [];

  /* ------------------------------------------------------------ arranque */

  function nueva() {
    return {
      version: VERSION,
      creada: U.ahoraISO(),
      actualizada: U.ahoraISO(),
      poliza: {
        numero: 'C-10537',
        nombre: 'Póliza colectiva de automóviles para empleados',
        aseguradora: 'AXA Colpatria',
        vigenciaDesde: '',
        vigenciaHasta: '',
        concepto: '3055'
      },
      config: { tolerancia: 2 },
      colaboradores: {},
      vehiculos: {},
      movimientos: [],
      cobros: [],
      auditoria: []
    };
  }

  function cargar() {
    return Almacen.leerJSON(RUTA_BASE).then(datos => {
      base = datos && datos.version ? migrar(datos) : null;
      return base;
    });
  }

  function migrar(datos) {
    if (!datos.config) datos.config = { tolerancia: 2 };
    if (!datos.auditoria) datos.auditoria = [];
    if (!datos.cobros) datos.cobros = [];
    return datos;
  }

  function crear() {
    base = nueva();
    return guardar().then(() => base);
  }

  function importarBase(obj) {
    if (!obj || !obj.vehiculos) throw new Error('El archivo no parece ser una base de esta aplicación.');
    base = migrar(obj);
    registrar('base_importada', 'Se reemplazó la base con un archivo externo');
    return guardar().then(() => base);
  }

  function obtener() { return base; }
  function hayBase() { return !!base; }

  /* ------------------------------------------------------------- guardar */

  function guardar() {
    if (!base) return Promise.resolve(false);
    base.actualizada = U.ahoraISO();
    return Almacen.escribirJSON(RUTA_BASE, base).then(r => { avisar(); return r; });
  }

  /** Guarda sin bloquear la interfaz; agrupa escrituras seguidas. */
  function guardarPronto() {
    if (pendienteGuardar) clearTimeout(pendienteGuardar);
    pendienteGuardar = setTimeout(() => { pendienteGuardar = null; guardar(); }, 400);
    avisar();
  }

  function respaldar(motivo) {
    if (!base) return Promise.resolve(false);
    const nombre = 'respaldos/base-' + U.hoyISO() + '-' + Date.now().toString(36) + '.json';
    return Almacen.escribirJSON(nombre, base).then(() => {
      registrar('respaldo', motivo || 'Respaldo automático', { archivo: nombre });
      return nombre;
    }).catch(() => false);
  }

  function suscribir(fn) { oyentes.push(fn); }
  function avisar() { oyentes.forEach(fn => { try { fn(base); } catch (e) { /* noop */ } }); }

  /* ----------------------------------------------------------- auditoría */

  function registrar(accion, detalle, extra) {
    if (!base) return;
    base.auditoria.unshift({ fecha: U.ahoraISO(), accion, detalle, extra: extra || null });
    if (base.auditoria.length > 1000) base.auditoria.length = 1000;
  }

  /* -------------------------------------------------------- colaboradores */

  function colaborador(cc) {
    return base.colaboradores[U.cedula(cc)] || null;
  }

  function asegurarColaborador(cc, nombre) {
    const c = U.cedula(cc);
    if (!c) return null;
    if (!base.colaboradores[c]) {
      base.colaboradores[c] = {
        cedula: c, nombre: String(nombre || '').trim(), estado: 'activo',
        notas: '', creado: U.ahoraISO(), actualizado: U.ahoraISO()
      };
    } else if (nombre && !base.colaboradores[c].nombre) {
      base.colaboradores[c].nombre = String(nombre).trim();
    }
    return base.colaboradores[c];
  }

  function colaboradores() {
    return Object.keys(base.colaboradores).map(k => base.colaboradores[k]);
  }

  function vehiculosDe(cc) {
    const c = U.cedula(cc);
    return vehiculos().filter(v => U.cedula(v.ccEmpleado) === c);
  }

  function movimientosDe(cc) {
    const c = U.cedula(cc);
    return base.movimientos.filter(m => U.cedula(m.cedulaEmpleado) === c);
  }

  /* -------------------------------------------------------------- vehículos */

  function vehiculos() {
    return Object.keys(base.vehiculos).map(k => base.vehiculos[k]);
  }

  function vehiculo(id) { return base.vehiculos[id] || null; }

  function buscarVehiculo(porPoliza, porPlaca) {
    const p = U.clave(porPoliza), pl = U.clave(porPlaca);
    const lista = vehiculos();
    if (p) {
      const x = lista.find(v => U.clave(v.poliza) === p);
      if (x) return { vehiculo: x, via: 'poliza' };
    }
    if (pl) {
      const x = lista.find(v => U.clave(v.placa) === pl);
      if (x) return { vehiculo: x, via: 'placa' };
    }
    return null;
  }

  function crearVehiculo(datos) {
    const v = Object.assign({
      id: U.id('v'),
      poliza: '', placa: '', ccAsegurado: '', nombreAsegurado: '', estadoAsegurado: 'AFILIADO',
      ccEmpleado: '', nombreEmpleado: '', beneficiario: '', clase: '', marca: '', modelo: '',
      estado: 'vigente', primaActual: null, primaDesde: '', historial: {},
      notas: '', creado: U.ahoraISO(), actualizado: U.ahoraISO()
    }, datos || {});
    if (!v.id) v.id = U.id('v');
    base.vehiculos[v.id] = v;
    asegurarColaborador(v.ccEmpleado, v.nombreEmpleado);
    return v;
  }

  function actualizarVehiculo(id, cambios, motivo) {
    const v = base.vehiculos[id];
    if (!v) return null;
    const antes = {};
    Object.keys(cambios).forEach(k => { if (v[k] !== cambios[k]) antes[k] = v[k]; });
    Object.assign(v, cambios);
    v.actualizado = U.ahoraISO();
    if (Object.keys(antes).length) {
      registrar('vehiculo_editado', motivo || ('Se editó ' + (v.placa || v.poliza)), { id, antes, despues: cambios });
    }
    asegurarColaborador(v.ccEmpleado, v.nombreEmpleado);
    return v;
  }

  function eliminarVehiculo(id) {
    const v = base.vehiculos[id];
    if (!v) return false;
    delete base.vehiculos[id];
    registrar('vehiculo_eliminado', 'Se eliminó ' + (v.placa || v.poliza) + ' de la base', { vehiculo: v });
    return true;
  }

  /* ------------------------------------------------------------ movimientos */

  function crearMovimiento(datos) {
    const m = Object.assign({
      id: U.id('m'),
      tipo: 'inclusion',
      vehiculoId: null,
      placa: '',
      cedulaEmpleado: '',
      nombreEmpleado: '',
      fechaEfectiva: U.hoyISO(),
      fechaRegistro: U.ahoraISO(),
      estado: 'pendiente',
      detalle: {},
      observacion: '',
      cobroMaterializado: null
    }, datos || {});
    if (!m.id) m.id = U.id('m');
    base.movimientos.unshift(m);
    registrar('movimiento', (TIPOS_MOVIMIENTO[m.tipo] || {}).etiqueta + ' — ' + (m.placa || m.cedulaEmpleado), { id: m.id });
    return m;
  }

  function actualizarMovimiento(id, cambios) {
    const m = base.movimientos.find(x => x.id === id);
    if (!m) return null;
    Object.assign(m, cambios);
    return m;
  }

  function eliminarMovimiento(id) {
    const i = base.movimientos.findIndex(x => x.id === id);
    if (i === -1) return false;
    const m = base.movimientos[i];
    base.movimientos.splice(i, 1);
    registrar('movimiento_eliminado', 'Se eliminó un movimiento de ' + (m.placa || m.cedulaEmpleado), { movimiento: m });
    return true;
  }

  function movimientos(filtro) {
    const f = filtro || {};
    return base.movimientos.filter(m => {
      if (f.tipo && m.tipo !== f.tipo) return false;
      if (f.estado && m.estado !== f.estado) return false;
      if (f.vehiculoId && m.vehiculoId !== f.vehiculoId) return false;
      if (f.desde && m.fechaEfectiva < f.desde) return false;
      if (f.hasta && m.fechaEfectiva > f.hasta) return false;
      return true;
    });
  }

  function movimientosPendientes() {
    return base.movimientos.filter(m => m.estado === 'pendiente');
  }

  /* ---------------------------------------------------------------- cobros */

  function cobros() { return base.cobros.slice().sort((a, b) => (a.id < b.id ? 1 : -1)); }
  function cobro(id) { return base.cobros.find(c => c.id === id) || null; }
  function ultimoCobro() { const c = cobros(); return c.length ? c[0] : null; }

  function guardarLineasCobro(id, lineas) {
    return Almacen.escribirJSON('cobros/' + id + '.json', { id, lineas });
  }
  function leerLineasCobro(id) {
    return Almacen.leerJSON('cobros/' + id + '.json').then(d => (d && d.lineas) || []);
  }

  /* --------------------------------------------------------------- búsqueda */

  /** Busca en vehículos por placa, póliza, cédula o nombre. */
  function buscar(texto) {
    const q = U.norm(texto);
    if (!q) return vehiculos();
    const qc = U.clave(texto);
    return vehiculos().filter(v =>
      U.clave(v.placa).indexOf(qc) !== -1 ||
      U.clave(v.poliza).indexOf(qc) !== -1 ||
      U.clave(v.ccEmpleado).indexOf(qc) !== -1 ||
      U.clave(v.ccAsegurado).indexOf(qc) !== -1 ||
      U.norm(v.nombreEmpleado).indexOf(q) !== -1 ||
      U.norm(v.nombreAsegurado).indexOf(q) !== -1 ||
      U.norm(v.beneficiario).indexOf(q) !== -1 ||
      U.norm(v.marca).indexOf(q) !== -1
    );
  }

  /* ----------------------------------------------------------------- alertas */

  /**
   * Señales que merecen la atención del usuario, calculadas sobre el estado
   * actual de la base y el último cobro aplicado.
   */
  function alertas() {
    if (!base) return [];
    const salida = [];
    const ultimo = ultimoCobro();

    // Vehículos excluidos que siguieron apareciendo más de un cobro.
    vehiculos().forEach(v => {
      if (v.estado !== 'excluido' && v.estado !== 'en_exclusion') return;
      const meses = Object.keys(v.historial || {}).sort();
      const mov = base.movimientos.find(m => m.vehiculoId === v.id && m.tipo === 'exclusion');
      if (!mov) return;
      const posteriores = meses.filter(m => m > (mov.fechaEfectiva || '').slice(0, 7));
      if (posteriores.length > 1) {
        salida.push({
          nivel: 'grave', vehiculoId: v.id,
          texto: 'La placa ' + v.placa + ' se excluyó el ' + U.fecha(mov.fechaEfectiva) +
                 ' y ha seguido apareciendo en ' + posteriores.length + ' cobros. Posible cobro indebido.'
        });
      }
    });

    // Movimientos pendientes con fecha efectiva ya pasada.
    const hoy = U.hoyISO();
    movimientosPendientes().forEach(m => {
      if (m.fechaEfectiva && m.fechaEfectiva <= hoy && ultimo && ultimo.aplicadoEn) {
        const mesMov = m.fechaEfectiva.slice(0, 7);
        if (mesMov < ultimo.id) {
          salida.push({
            nivel: 'aviso', movimientoId: m.id,
            texto: (TIPOS_MOVIMIENTO[m.tipo] || {}).etiqueta + ' de ' + (m.placa || m.cedulaEmpleado) +
                   ', efectiva desde ' + U.fecha(m.fechaEfectiva) + ', sigue sin verse en el cobro.'
          });
        }
      }
    });

    // Beneficiarios que no son el asegurado ni una entidad.
    vehiculos().forEach(v => {
      if (v.estado === 'excluido') return;
      if (U.revisarBeneficiario(v.nombreAsegurado, v.beneficiario) === 'REVISAR') {
        salida.push({
          nivel: 'aviso', vehiculoId: v.id,
          texto: 'En la placa ' + v.placa + ' el beneficiario (' + v.beneficiario + ') no es el asegurado ni una entidad financiera.'
        });
      }
    });

    // Colaboradores retirados con vehículos vigentes.
    colaboradores().forEach(c => {
      if (c.estado !== 'retirado') return;
      const vig = vehiculosDe(c.cedula).filter(v => v.estado === 'vigente');
      if (vig.length) {
        salida.push({
          nivel: 'grave', cedula: c.cedula,
          texto: c.nombre + ' está marcado como retirado y aún tiene ' + vig.length + ' vehículo(s) vigente(s).'
        });
      }
    });

    return salida;
  }

  /* -------------------------------------------------------------- resumen */

  function resumen() {
    if (!base) return null;
    const v = vehiculos();
    const ultimo = ultimoCobro();
    return {
      vehiculos: v.length,
      vigentes: v.filter(x => x.estado === 'vigente').length,
      enExclusion: v.filter(x => x.estado === 'en_exclusion').length,
      excluidos: v.filter(x => x.estado === 'excluido').length,
      colaboradores: colaboradores().length,
      pendientes: movimientosPendientes().length,
      ultimoCobro: ultimo,
      primaMensual: v.filter(x => x.estado !== 'excluido')
        .reduce((s, x) => s + (x.primaActual || 0), 0)
    };
  }

  return {
    TIPOS_MOVIMIENTO, ESTADOS_MOVIMIENTO, ESTADOS_VEHICULO, RUTA_BASE,
    cargar, crear, importarBase, obtener, hayBase, guardar, guardarPronto, respaldar,
    suscribir, registrar,
    colaborador, asegurarColaborador, colaboradores, vehiculosDe, movimientosDe,
    vehiculos, vehiculo, buscarVehiculo, crearVehiculo, actualizarVehiculo, eliminarVehiculo,
    crearMovimiento, actualizarMovimiento, eliminarMovimiento, movimientos, movimientosPendientes,
    cobros, cobro, ultimoCobro, guardarLineasCobro, leerLineasCobro,
    buscar, alertas, resumen
  };
})();
