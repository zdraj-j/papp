/* ============================================================================
   Vistas — todo lo que se dibuja en el área principal
   ========================================================================== */
'use strict';

window.Vistas = (function () {

  const el = U.el;
  const contenedor = () => document.getElementById('principal');

  function pintar(nodos) {
    const c = U.vaciar(contenedor());
    (Array.isArray(nodos) ? nodos : [nodos]).forEach(n => { if (n) c.appendChild(n); });
    c.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function tonoEstadoVehiculo(estado) {
    return estado === 'vigente' ? 'ok' : (estado === 'en_exclusion' ? 'dato' : 'baja');
  }

  function marcaVehiculo(v) {
    return UI.marca(Modelo.ESTADOS_VEHICULO[v.estado] || v.estado, tonoEstadoVehiculo(v.estado));
  }

  function vehiculoTexto(v) {
    return [v.clase, v.marca, v.modelo].filter(Boolean).join(' · ');
  }

  /* ========================================================= PANEL (inicio) */

  function inicio() {
    const r = Modelo.resumen();
    const alertas = Modelo.alertas();
    const pendientes = Modelo.movimientosPendientes();
    const ultimo = r.ultimoCobro;

    const tarjetas = el('div', { clase: 'tarjetas' }, [
      UI.dato(U.cantidad(r.vigentes), 'Vehículos vigentes'),
      UI.dato(U.cantidad(r.enExclusion), 'En exclusión', r.enExclusion ? 'dato' : null),
      UI.dato(U.cantidad(r.colaboradores), 'Colaboradores'),
      UI.dato(U.cantidad(r.pendientes), 'Movimientos pendientes', r.pendientes ? 'dato' : null),
      UI.dato(U.dinero(r.primaMensual), 'Prima mensual en la base')
    ]);

    const cajaAlertas = el('div', { clase: 'seccion' }, [
      el('h2', { texto: 'Alertas' }),
      el('p', { clase: 'ayuda', texto: 'Señales que conviene revisar antes de pagar el próximo cobro.' })
    ]);
    if (!alertas.length) {
      cajaAlertas.appendChild(el('div', { clase: 'alerta alerta--ok', texto: 'Nada pendiente de revisar en este momento.' }));
    } else {
      alertas.slice(0, 12).forEach(a => {
        const nodo = el('div', { clase: 'alerta' + (a.nivel === 'grave' ? ' alerta--grave' : '') }, [
          el('span', { texto: a.texto })
        ]);
        if (a.vehiculoId) {
          nodo.appendChild(el('a', {
            href: '#', texto: 'ver', onclick: ev => { ev.preventDefault(); detalleVehiculo(a.vehiculoId); }
          }));
        }
        cajaAlertas.appendChild(nodo);
      });
      if (alertas.length > 12) {
        cajaAlertas.appendChild(el('p', { clase: 'ayuda', texto: 'Y ' + (alertas.length - 12) + ' más.' }));
      }
    }

    const cajaCobro = el('div', { clase: 'panel' }, ultimo ? [
      el('h2', { texto: ultimo.etiqueta + ' — ' + U.mes(ultimo.id) }),
      el('p', { clase: 'ayuda', texto: ultimo.periodo || '' }),
      UI.ficha([
        ['Registros', U.cantidad(ultimo.registros)],
        ['Suma de las líneas', U.dinero(ultimo.totalLineas)],
        ['Total impreso en la factura', U.dinero(ultimo.totalDeclarado)],
        ['Aplicado a la base', U.fechaHora(ultimo.aplicadoEn)],
        ['Archivo plano', ultimo.planoGenerado ? U.fechaHora(ultimo.planoGenerado) : 'Sin generar']
      ])
    ] : [
      el('h2', { texto: 'Todavía no has importado ningún cobro' }),
      el('p', { clase: 'ayuda', texto: 'Importa el pre-cobro más reciente para que la base nazca con la información actual.' }),
      UI.boton('Importar un cobro', () => App.ir('#/cobros'))
    ]);

    const tablaPend = pendientes.length
      ? UI.tabla([
        { titulo: 'Tipo', valor: m => (Modelo.TIPOS_MOVIMIENTO[m.tipo] || {}).etiqueta },
        { titulo: 'Placa', clave: 'placa', clase: 'mono' },
        { titulo: 'Colaborador', valor: m => m.nombreEmpleado || m.cedulaEmpleado },
        { titulo: 'Efectivo desde', valor: m => U.fecha(m.fechaEfectiva) },
        { titulo: 'Registrado', valor: m => U.fecha(m.fechaRegistro) }
      ], pendientes, { tono: m => (Modelo.TIPOS_MOVIMIENTO[m.tipo] || {}).color })
      : el('div', { clase: 'vacio', texto: 'No hay movimientos esperando confirmación en el próximo cobro.' });

    pintar([
      UI.titulo('Panel', 'Estado de la póliza ' + Modelo.obtener().poliza.numero + '.', [
        UI.boton('Registrar movimiento', () => nuevoMovimiento(), 'boton--claro'),
        UI.boton('Importar cobro', () => App.ir('#/cobros'))
      ]),
      tarjetas,
      cajaAlertas,
      UI.seccion('Movimientos pendientes', 'Novedades registradas que todavía no se ven reflejadas en un cobro.', tablaPend),
      UI.seccion('Último cobro', null, cajaCobro)
    ]);
  }

  /* ============================================================== VEHÍCULOS */

  const filtroVeh = { texto: '', estado: '', clase: '', marca: '', beneficiario: '' };

  function vehiculos() {
    const barra = el('div', { clase: 'barra' });

    const busca = el('input', {
      type: 'search', placeholder: 'Placa, póliza, cédula, nombre o marca', value: filtroVeh.texto
    });
    busca.addEventListener('input', () => { filtroVeh.texto = busca.value; refrescar(); });
    barra.appendChild(el('div', { clase: 'crece' }, [busca]));

    const todos = Modelo.vehiculos();
    const selEstado = selector('Estado', [
      { valor: '', texto: 'Todos los estados' },
      { valor: 'vigente', texto: 'Vigentes' },
      { valor: 'en_exclusion', texto: 'En exclusión' },
      { valor: 'excluido', texto: 'Excluidos' }
    ], filtroVeh.estado, v => { filtroVeh.estado = v; refrescar(); });

    const clases = [...new Set(todos.map(v => v.clase).filter(Boolean))].sort();
    const selClase = selector('Clase', [{ valor: '', texto: 'Toda clase' }]
      .concat(clases.map(c => ({ valor: c, texto: c }))), filtroVeh.clase, v => { filtroVeh.clase = v; refrescar(); });

    const marcas = [...new Set(todos.map(v => v.marca).filter(Boolean))].sort();
    const selMarca = selector('Marca', [{ valor: '', texto: 'Toda marca' }]
      .concat(marcas.map(c => ({ valor: c, texto: c }))), filtroVeh.marca, v => { filtroVeh.marca = v; refrescar(); });

    const selBen = selector('Beneficiario', [
      { valor: '', texto: 'Cualquier beneficiario' },
      { valor: 'REVISAR', texto: 'Beneficiario por revisar' },
      { valor: 'ENTIDAD', texto: 'Beneficiario es entidad' },
      { valor: 'OK', texto: 'Beneficiario = asegurado' }
    ], filtroVeh.beneficiario, v => { filtroVeh.beneficiario = v; refrescar(); });

    barra.appendChild(selEstado); barra.appendChild(selClase);
    barra.appendChild(selMarca); barra.appendChild(selBen);

    const caja = el('div');

    function aplicarFiltros() {
      let lista = filtroVeh.texto ? Modelo.buscar(filtroVeh.texto) : Modelo.vehiculos();
      if (filtroVeh.estado) lista = lista.filter(v => v.estado === filtroVeh.estado);
      if (filtroVeh.clase) lista = lista.filter(v => v.clase === filtroVeh.clase);
      if (filtroVeh.marca) lista = lista.filter(v => v.marca === filtroVeh.marca);
      if (filtroVeh.beneficiario) {
        lista = lista.filter(v => U.revisarBeneficiario(v.nombreAsegurado, v.beneficiario) === filtroVeh.beneficiario ||
          (filtroVeh.beneficiario === 'REVISAR' && U.revisarBeneficiario(v.nombreAsegurado, v.beneficiario) === 'PARCIAL'));
      }
      return lista;
    }

    function refrescar() {
      const lista = aplicarFiltros();
      U.vaciar(caja);
      caja.appendChild(el('p', {
        clase: 'ayuda',
        texto: U.cantidad(lista.length) + ' de ' + U.cantidad(Modelo.vehiculos().length) +
               ' vehículos · prima sumada ' + U.dinero(lista.reduce((s, v) => s + (v.primaActual || 0), 0))
      }));
      caja.appendChild(UI.tabla([
        { clave: 'placa', titulo: 'Placa', clase: 'mono', orden: true },
        { clave: 'poliza', titulo: 'Póliza', clase: 'mono', orden: true },
        { clave: 'nombreAsegurado', titulo: 'Asegurado', orden: true },
        { clave: 'nombreEmpleado', titulo: 'Empleado', orden: true },
        { clave: 'beneficiario', titulo: 'Beneficiario', orden: true, render: v => {
            const r = U.revisarBeneficiario(v.nombreAsegurado, v.beneficiario);
            if (r === 'REVISAR') {
              return el('span', {}, [document.createTextNode((v.beneficiario || '—') + ' '), UI.marca('revisar', 'grave')]);
            }
            return v.beneficiario || '—';
          } },
        { titulo: 'Vehículo', valor: vehiculoTexto, orden: true, clave: 'marca' },
        { clave: 'primaActual', titulo: 'Prima', clase: 'num', orden: true, valor: v => v.primaActual,
          render: v => U.dinero(v.primaActual) },
        { clave: 'estado', titulo: 'Estado', orden: true, render: marcaVehiculo }
      ], lista, {
        ordenPor: 'placa',
        alClic: v => detalleVehiculo(v.id),
        tono: v => (v.estado === 'excluido' ? 'baja' : (v.estado === 'en_exclusion' ? 'dato' : null)),
        vacio: 'Ningún vehículo coincide con el filtro.'
      }));
    }

    refrescar();

    pintar([
      UI.titulo('Vehículos', 'La base de la póliza. Haz clic en una fila para ver la ficha completa.', [
        UI.boton('Exportar a Excel', () => exportarVehiculos(aplicarFiltros()), 'boton--claro'),
        UI.boton('Agregar vehículo', () => editarVehiculo(null))
      ]),
      barra, caja
    ]);
  }

  function selector(etiqueta, opciones, valor, alCambiar) {
    const s = el('select', { 'aria-label': etiqueta, style: 'width:auto' });
    opciones.forEach(o => {
      const op = el('option', { value: o.valor, texto: o.texto });
      if (String(o.valor) === String(valor)) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener('change', () => alCambiar(s.value));
    return s;
  }

  /* -------------------------------------------------------- ficha vehículo */

  function detalleVehiculo(id) {
    const v = Modelo.vehiculo(id);
    if (!v) return;
    const col = Modelo.colaborador(v.ccEmpleado);
    const movs = Modelo.movimientos({ vehiculoId: v.id });
    const meses = Object.keys(v.historial || {}).sort();

    const cuerpo = el('div');
    cuerpo.appendChild(UI.ficha([
      ['Placa', v.placa],
      ['No. de póliza', v.poliza],
      ['Estado', marcaVehiculo(v)],
      ['Asegurado', v.nombreAsegurado],
      ['Cédula del asegurado', v.ccAsegurado],
      ['Empleado', v.nombreEmpleado],
      ['Cédula del empleado', v.ccEmpleado],
      ['Beneficiario', v.beneficiario],
      ['Clase', v.clase],
      ['Marca', v.marca],
      ['Modelo', v.modelo],
      ['Prima actual', U.dinero(v.primaActual)],
      ['Notas', v.notas || '—']
    ]));

    const rev = U.revisarBeneficiario(v.nombreAsegurado, v.beneficiario);
    if (rev === 'REVISAR' || rev === 'PARCIAL') {
      cuerpo.appendChild(el('div', {
        clase: 'alerta' + (rev === 'REVISAR' ? ' alerta--grave' : ''),
        style: 'margin-top:1rem',
        texto: rev === 'REVISAR'
          ? 'El beneficiario no es el asegurado ni una entidad financiera.'
          : 'El beneficiario parece ser el mismo asegurado con el nombre escrito distinto.'
      }));
    }

    if (meses.length) {
      cuerpo.appendChild(el('h2', { texto: 'Historial de prima', style: 'margin-top:1.3rem;font-size:1.05rem' }));
      cuerpo.appendChild(UI.tabla([
        { titulo: 'Cobro', valor: m => U.mes(m) },
        { titulo: 'Prima', clase: 'num', valor: m => U.dinero(v.historial[m]) },
        { titulo: 'Variación', clase: 'num', render: (m) => {
            const i = meses.indexOf(m);
            if (i === 0) return '—';
            const d = (v.historial[m] || 0) - (v.historial[meses[i - 1]] || 0);
            if (!d) return 'sin cambio';
            return el('span', { clase: d > 0 ? 'sube' : 'bajaval', texto: (d > 0 ? '+' : '') + U.dinero(d) });
          } }
      ], meses.slice().reverse(), {}));
    }

    cuerpo.appendChild(el('h2', { texto: 'Movimientos', style: 'margin-top:1.3rem;font-size:1.05rem' }));
    cuerpo.appendChild(movs.length ? UI.tabla([
      { titulo: 'Tipo', valor: m => (Modelo.TIPOS_MOVIMIENTO[m.tipo] || {}).etiqueta },
      { titulo: 'Efectivo desde', valor: m => U.fecha(m.fechaEfectiva) },
      { titulo: 'Estado', render: m => UI.marca(Modelo.ESTADOS_MOVIMIENTO[m.estado], m.estado === 'pendiente' ? 'dato' : 'ok') },
      { titulo: 'Observación', clave: 'observacion' }
    ], movs, {}) : el('div', { clase: 'vacio', texto: 'Sin movimientos registrados.' }));

    if (col) {
      cuerpo.appendChild(el('p', { clase: 'ayuda', style: 'margin-top:1rem' }, [
        document.createTextNode('Este colaborador tiene ' + Modelo.vehiculosDe(col.cedula).length + ' vehículo(s) en la póliza. '),
        el('a', { href: '#', texto: 'Ver su ficha', onclick: ev => { ev.preventDefault(); UI.cerrarModal(); detalleColaborador(col.cedula); } })
      ]));
    }

    UI.modal({
      titulo: v.placa + ' · ' + (v.nombreAsegurado || ''),
      ancha: true,
      cuerpo,
      acciones: [
        { texto: 'Eliminar', clase: 'boton--peligro', accion: () => {
            UI.cerrarModal();
            UI.confirmar('Eliminar vehículo',
              'Se borrará ' + v.placa + ' de la base junto con su historial de prima. Los movimientos quedan.',
              'Eliminar').then(ok => {
                if (!ok) return;
                Modelo.eliminarVehiculo(v.id);
                Modelo.guardarPronto();
                UI.aviso('Vehículo eliminado', 'bien');
                App.repintar();
              });
          } },
        { texto: 'Registrar movimiento', clase: 'boton--claro', accion: () => { UI.cerrarModal(); nuevoMovimiento(v); } },
        { texto: 'Editar', accion: () => { UI.cerrarModal(); editarVehiculo(v); } }
      ]
    });
  }

  function editarVehiculo(v) {
    const nuevo = !v;
    const f = UI.formulario([
      { nombre: 'placa', etiqueta: 'Placa', valor: v ? v.placa : '', requerido: true },
      { nombre: 'poliza', etiqueta: 'No. de póliza', valor: v ? v.poliza : '' },
      { nombre: 'ccAsegurado', etiqueta: 'Cédula del asegurado', valor: v ? v.ccAsegurado : '' },
      { nombre: 'nombreAsegurado', etiqueta: 'Nombre del asegurado', valor: v ? v.nombreAsegurado : '' },
      { nombre: 'ccEmpleado', etiqueta: 'Cédula del empleado', valor: v ? v.ccEmpleado : '', requerido: true,
        ayuda: 'Es la cédula que va en el archivo plano.' },
      { nombre: 'nombreEmpleado', etiqueta: 'Nombre del empleado', valor: v ? v.nombreEmpleado : '' },
      { nombre: 'beneficiario', etiqueta: 'Beneficiario', valor: v ? v.beneficiario : '', ancho: true },
      { nombre: 'clase', etiqueta: 'Clase', valor: v ? v.clase : '' },
      { nombre: 'marca', etiqueta: 'Marca', valor: v ? v.marca : '' },
      { nombre: 'modelo', etiqueta: 'Modelo', valor: v ? v.modelo : '' },
      { nombre: 'primaActual', etiqueta: 'Prima mensual', tipo: 'number', valor: v ? v.primaActual : '' },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', valor: v ? v.estado : 'vigente',
        opciones: Object.keys(Modelo.ESTADOS_VEHICULO).map(k => ({ valor: k, texto: Modelo.ESTADOS_VEHICULO[k] })) },
      { nombre: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: v ? v.notas : '', ancho: true }
    ]);

    const m = UI.modal({
      titulo: nuevo ? 'Agregar vehículo' : 'Editar ' + v.placa,
      ayuda: nuevo
        ? 'Normalmente los vehículos entran solos al importar el cobro. Úsalo cuando necesites cargar uno a mano.'
        : 'Los cambios quedan registrados en la bitácora de la base.',
      ancha: true,
      cuerpo: f.nodo,
      acciones: [{
        texto: 'Guardar', accion: () => {
          const d = f.leer();
          d.placa = U.clave(d.placa);
          d.ccEmpleado = U.cedula(d.ccEmpleado);
          d.ccAsegurado = U.cedula(d.ccAsegurado);
          if (!d.placa || !d.ccEmpleado) { UI.aviso('La placa y la cédula del empleado son obligatorias', 'mal'); return; }
          if (nuevo) Modelo.crearVehiculo(d);
          else Modelo.actualizarVehiculo(v.id, d, 'Edición manual');
          Modelo.guardarPronto();
          m.cerrar();
          UI.aviso(nuevo ? 'Vehículo agregado' : 'Cambios guardados', 'bien');
          App.repintar();
        }
      }]
    });
  }

  function exportarVehiculos(lista) {
    const cab = ['Placa', 'Poliza', 'Cedula asegurado', 'Asegurado', 'Cedula empleado', 'Empleado',
      'Beneficiario', 'Clase', 'Marca', 'Modelo', 'Prima', 'Estado'];
    const filas = lista.map(v => [v.placa, v.poliza, v.ccAsegurado, v.nombreAsegurado, v.ccEmpleado,
      v.nombreEmpleado, v.beneficiario, v.clase, v.marca, v.modelo, v.primaActual,
      Modelo.ESTADOS_VEHICULO[v.estado] || v.estado]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([cab].concat(filas)), 'Vehículos');
    XLSX.writeFile(libro, 'vehiculos_' + U.hoyISO() + '.xlsx');
  }

  /* =========================================================== COLABORADORES */

  let filtroCol = '';

  function colaboradores() {
    const barra = el('div', { clase: 'barra' });
    const busca = el('input', { type: 'search', placeholder: 'Nombre o cédula', value: filtroCol });
    busca.addEventListener('input', () => { filtroCol = busca.value; refrescar(); });
    barra.appendChild(el('div', { clase: 'crece' }, [busca]));

    const caja = el('div');

    function refrescar() {
      const q = U.norm(filtroCol), qc = U.clave(filtroCol);
      const lista = Modelo.colaboradores().filter(c =>
        !filtroCol || U.norm(c.nombre).indexOf(q) !== -1 || U.clave(c.cedula).indexOf(qc) !== -1
      ).map(c => {
        const vs = Modelo.vehiculosDe(c.cedula);
        return {
          col: c, cedula: c.cedula, nombre: c.nombre, estado: c.estado,
          vehiculos: vs.length,
          vigentes: vs.filter(v => v.estado === 'vigente').length,
          descuento: vs.filter(v => v.estado !== 'excluido').reduce((s, v) => s + (v.primaActual || 0), 0)
        };
      });

      U.vaciar(caja);
      caja.appendChild(UI.tabla([
        { clave: 'nombre', titulo: 'Colaborador', orden: true },
        { clave: 'cedula', titulo: 'Cédula', clase: 'mono', orden: true },
        { clave: 'vehiculos', titulo: 'Vehículos', clase: 'num', orden: true },
        { clave: 'vigentes', titulo: 'Vigentes', clase: 'num', orden: true },
        { clave: 'descuento', titulo: 'Descuento mensual', clase: 'num', orden: true, render: x => U.dinero(x.descuento) },
        { clave: 'estado', titulo: 'Estado', orden: true,
          render: x => UI.marca(x.estado === 'activo' ? 'Activo' : 'Retirado', x.estado === 'activo' ? 'ok' : 'baja') }
      ], lista, {
        ordenPor: 'nombre',
        alClic: x => detalleColaborador(x.cedula),
        tono: x => (x.estado === 'retirado' ? 'baja' : null),
        vacio: 'Ningún colaborador coincide.'
      }));
    }

    refrescar();
    pintar([
      UI.titulo('Colaboradores', 'Cada persona con vehículos en la póliza. Haz clic para ver su historial completo.'),
      barra, caja
    ]);
  }

  function detalleColaborador(cc) {
    const c = Modelo.colaborador(cc);
    if (!c) return;
    const vs = Modelo.vehiculosDe(cc);
    const movs = Modelo.movimientosDe(cc);

    const cuerpo = el('div');
    cuerpo.appendChild(UI.ficha([
      ['Cédula', c.cedula],
      ['Estado', UI.marca(c.estado === 'activo' ? 'Activo' : 'Retirado', c.estado === 'activo' ? 'ok' : 'baja')],
      ['Vehículos en la póliza', U.cantidad(vs.length)],
      ['Descuento mensual', U.dinero(vs.filter(v => v.estado !== 'excluido').reduce((s, v) => s + (v.primaActual || 0), 0))],
      ['Notas', c.notas || '—']
    ]));

    cuerpo.appendChild(el('h2', { texto: 'Vehículos', style: 'margin-top:1.3rem;font-size:1.05rem' }));
    cuerpo.appendChild(UI.tabla([
      { clave: 'placa', titulo: 'Placa', clase: 'mono' },
      { titulo: 'Vehículo', valor: vehiculoTexto },
      { clave: 'beneficiario', titulo: 'Beneficiario' },
      { titulo: 'Prima', clase: 'num', render: v => U.dinero(v.primaActual) },
      { titulo: 'Estado', render: marcaVehiculo }
    ], vs, { alClic: v => { UI.cerrarModal(); detalleVehiculo(v.id); }, vacio: 'Sin vehículos.' }));

    cuerpo.appendChild(el('h2', { texto: 'Movimientos', style: 'margin-top:1.3rem;font-size:1.05rem' }));
    cuerpo.appendChild(movs.length ? UI.tabla([
      { titulo: 'Tipo', valor: m => (Modelo.TIPOS_MOVIMIENTO[m.tipo] || {}).etiqueta },
      { clave: 'placa', titulo: 'Placa', clase: 'mono' },
      { titulo: 'Efectivo desde', valor: m => U.fecha(m.fechaEfectiva) },
      { titulo: 'Estado', render: m => UI.marca(Modelo.ESTADOS_MOVIMIENTO[m.estado], m.estado === 'pendiente' ? 'dato' : 'ok') }
    ], movs, {}) : el('div', { clase: 'vacio', texto: 'Sin movimientos.' }));

    UI.modal({
      titulo: c.nombre || c.cedula,
      ancha: true,
      cuerpo,
      acciones: [
        { texto: c.estado === 'activo' ? 'Marcar como retirado' : 'Marcar como activo', clase: 'boton--claro',
          accion: () => {
            c.estado = c.estado === 'activo' ? 'retirado' : 'activo';
            c.actualizado = U.ahoraISO();
            Modelo.registrar('colaborador', (c.nombre || c.cedula) + ' quedó como ' + c.estado);
            Modelo.guardarPronto();
            UI.cerrarModal();
            UI.aviso('Estado actualizado', 'bien');
            App.repintar();
          } },
        { texto: 'Registrar movimiento', accion: () => { UI.cerrarModal(); nuevoMovimiento(vs[0] || null, c); } }
      ]
    });
  }

  /* ============================================================ MOVIMIENTOS */

  const filtroMov = { tipo: '', estado: '' };

  function movimientos() {
    const barra = el('div', { clase: 'barra' }, [
      selector('Tipo', [{ valor: '', texto: 'Todos los tipos' }].concat(
        Object.keys(Modelo.TIPOS_MOVIMIENTO).map(k => ({ valor: k, texto: Modelo.TIPOS_MOVIMIENTO[k].etiqueta }))
      ), filtroMov.tipo, v => { filtroMov.tipo = v; App.repintar(); }),
      selector('Estado', [{ valor: '', texto: 'Todos los estados' }].concat(
        Object.keys(Modelo.ESTADOS_MOVIMIENTO).map(k => ({ valor: k, texto: Modelo.ESTADOS_MOVIMIENTO[k] }))
      ), filtroMov.estado, v => { filtroMov.estado = v; App.repintar(); })
    ]);

    const lista = Modelo.movimientos(filtroMov);

    const tabla = UI.tabla([
      { titulo: 'Tipo', valor: m => (Modelo.TIPOS_MOVIMIENTO[m.tipo] || {}).etiqueta, orden: true, clave: 'tipo' },
      { clave: 'placa', titulo: 'Placa', clase: 'mono', orden: true },
      { titulo: 'Colaborador', valor: m => m.nombreEmpleado || m.cedulaEmpleado, orden: true, clave: 'nombreEmpleado' },
      { clave: 'fechaEfectiva', titulo: 'Efectivo desde', orden: true, render: m => U.fecha(m.fechaEfectiva) },
      { clave: 'estado', titulo: 'Estado', orden: true,
        render: m => UI.marca(Modelo.ESTADOS_MOVIMIENTO[m.estado],
          m.estado === 'pendiente' ? 'dato' : (m.estado === 'no_aplicado' ? 'grave' : 'ok')) },
      { titulo: 'Confirmado en', valor: m => (m.cobroMaterializado ? U.mes(m.cobroMaterializado) : '—') },
      { clave: 'observacion', titulo: 'Observación' },
      { titulo: '', render: m => el('button', {
          type: 'button', clase: 'boton boton--claro boton--mini', texto: 'Editar',
          onclick: () => editarMovimiento(m)
        }) }
    ], lista, {
      ordenPor: 'fechaEfectiva', ordenDir: 'desc',
      tono: m => (Modelo.TIPOS_MOVIMIENTO[m.tipo] || {}).color,
      vacio: 'No hay movimientos con ese filtro.'
    });

    pintar([
      UI.titulo('Movimientos', 'Las novedades que ocurren durante el mes. Quedan pendientes hasta que el cobro las confirme.', [
        UI.boton('Registrar movimiento', () => nuevoMovimiento())
      ]),
      barra, tabla
    ]);
  }

  function nuevoMovimiento(vehiculo, colaborador) {
    const vs = Modelo.vehiculos().filter(v => v.estado !== 'excluido')
      .sort((a, b) => String(a.placa).localeCompare(String(b.placa)));

    const campos = [
      { nombre: 'tipo', etiqueta: 'Tipo de movimiento', tipo: 'select',
        valor: vehiculo ? 'exclusion' : 'inclusion',
        opciones: Object.keys(Modelo.TIPOS_MOVIMIENTO).map(k => ({ valor: k, texto: Modelo.TIPOS_MOVIMIENTO[k].etiqueta })) },
      { nombre: 'fechaEfectiva', etiqueta: 'Efectivo desde', tipo: 'date', valor: U.hoyISO(), requerido: true,
        ayuda: 'Fecha a partir de la cual aplica el cambio.' },
      { nombre: 'vehiculoId', etiqueta: 'Vehículo de la base', tipo: 'select',
        valor: vehiculo ? vehiculo.id : '',
        opciones: [{ valor: '', texto: '— ninguno (vehículo nuevo) —' }].concat(
          vs.map(v => ({ valor: v.id, texto: v.placa + ' · ' + (v.nombreAsegurado || '') }))) },
      { nombre: 'placa', etiqueta: 'Placa', valor: vehiculo ? vehiculo.placa : '',
        ayuda: 'Para inclusiones, escribe la placa del vehículo que entra.' },
      { nombre: 'cedulaEmpleado', etiqueta: 'Cédula del empleado',
        valor: vehiculo ? vehiculo.ccEmpleado : (colaborador ? colaborador.cedula : '') },
      { nombre: 'nombreEmpleado', etiqueta: 'Nombre del empleado',
        valor: vehiculo ? vehiculo.nombreEmpleado : (colaborador ? colaborador.nombre : '') },
      { nombre: 'detalle', etiqueta: 'Dato del movimiento', ancho: true,
        ayuda: 'Nuevo beneficiario, número de siniestro, placa que reemplaza, etc.' },
      { nombre: 'observacion', etiqueta: 'Observación', tipo: 'textarea', ancho: true }
    ];

    const f = UI.formulario(campos);

    // Al escoger un vehículo se completan los datos del colaborador.
    f.entradas.vehiculoId.entrada.addEventListener('change', () => {
      const v = Modelo.vehiculo(f.entradas.vehiculoId.entrada.value);
      if (!v) return;
      f.entradas.placa.entrada.value = v.placa;
      f.entradas.cedulaEmpleado.entrada.value = v.ccEmpleado;
      f.entradas.nombreEmpleado.entrada.value = v.nombreEmpleado;
    });

    const m = UI.modal({
      titulo: 'Registrar movimiento',
      ayuda: 'El movimiento queda pendiente. Cuando importes el próximo cobro, la app verifica si la aseguradora lo aplicó.',
      ancha: true,
      cuerpo: f.nodo,
      acciones: [{
        texto: 'Registrar', accion: () => {
          const d = f.leer();
          if (!d.fechaEfectiva) { UI.aviso('Falta la fecha efectiva', 'mal'); return; }
          const mov = Modelo.crearMovimiento({
            tipo: d.tipo,
            vehiculoId: d.vehiculoId || null,
            placa: U.clave(d.placa),
            cedulaEmpleado: U.cedula(d.cedulaEmpleado),
            nombreEmpleado: d.nombreEmpleado,
            fechaEfectiva: d.fechaEfectiva,
            detalle: d.detalle ? { texto: d.detalle } : {},
            observacion: d.observacion
          });

          // Una exclusión marca el vehículo, para esperar su último cobro.
          if (mov.tipo === 'exclusion' && mov.vehiculoId) {
            Modelo.actualizarVehiculo(mov.vehiculoId, { estado: 'en_exclusion' }, 'Exclusión registrada');
          }
          if (mov.tipo === 'reactivacion' && mov.vehiculoId) {
            Modelo.actualizarVehiculo(mov.vehiculoId, { estado: 'vigente' }, 'Reactivación registrada');
          }
          if (mov.tipo === 'retiro_colaborador' && mov.cedulaEmpleado) {
            const c = Modelo.asegurarColaborador(mov.cedulaEmpleado, mov.nombreEmpleado);
            if (c) c.estado = 'retirado';
          }

          Modelo.guardarPronto();
          m.cerrar();
          UI.aviso('Movimiento registrado', 'bien');
          App.repintar();
        }
      }]
    });
  }

  function editarMovimiento(mov) {
    const f = UI.formulario([
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', valor: mov.estado,
        opciones: Object.keys(Modelo.ESTADOS_MOVIMIENTO).map(k => ({ valor: k, texto: Modelo.ESTADOS_MOVIMIENTO[k] })) },
      { nombre: 'fechaEfectiva', etiqueta: 'Efectivo desde', tipo: 'date', valor: mov.fechaEfectiva },
      { nombre: 'observacion', etiqueta: 'Observación', tipo: 'textarea', valor: mov.observacion, ancho: true }
    ]);

    const m = UI.modal({
      titulo: (Modelo.TIPOS_MOVIMIENTO[mov.tipo] || {}).etiqueta + ' · ' + (mov.placa || mov.cedulaEmpleado),
      ayuda: 'Marca como "no aplicado" lo que la aseguradora no hizo, para reclamarlo.',
      cuerpo: f.nodo,
      acciones: [
        { texto: 'Eliminar', clase: 'boton--peligro', accion: () => {
            m.cerrar();
            UI.confirmar('Eliminar movimiento', 'Esta acción no se puede deshacer.', 'Eliminar').then(ok => {
              if (!ok) return;
              Modelo.eliminarMovimiento(mov.id);
              Modelo.guardarPronto();
              App.repintar();
            });
          } },
        { texto: 'Guardar', accion: () => {
            Modelo.actualizarMovimiento(mov.id, f.leer());
            Modelo.guardarPronto();
            m.cerrar();
            UI.aviso('Movimiento actualizado', 'bien');
            App.repintar();
          } }
      ]
    });
  }

  /* ================================================================= COBROS */

  let conciliacionActual = null;

  function cobros() {
    const lista = Modelo.cobros();

    const zona = el('div', { clase: 'panel' }, [
      el('h2', { texto: 'Importar un cobro' }),
      el('p', { clase: 'ayuda', texto: 'Escoge el archivo de Excel del pre-cobro. Se lee únicamente la primera hoja.' })
    ]);
    const entrada = el('input', { type: 'file', accept: '.xlsx,.xls,.xlsm' });
    entrada.addEventListener('change', () => {
      if (entrada.files && entrada.files[0]) importar(entrada.files[0]);
    });
    zona.appendChild(entrada);

    const tabla = UI.tabla([
      { clave: 'id', titulo: 'Mes', orden: true, render: c => U.mes(c.id) },
      { clave: 'etiqueta', titulo: 'Cobro', orden: true },
      { clave: 'registros', titulo: 'Registros', clase: 'num', orden: true },
      { clave: 'totalLineas', titulo: 'Suma de líneas', clase: 'num', orden: true, render: c => U.dinero(c.totalLineas) },
      { titulo: 'Total impreso', clase: 'num', render: c => {
          if (c.totalDeclarado === null || c.totalDeclarado === undefined) return '—';
          const igual = Math.round(c.totalDeclarado) === Math.round(c.totalLineas);
          return el('span', { clase: igual ? '' : 'sube', texto: U.dinero(c.totalDeclarado) });
        } },
      { titulo: 'Aplicado', valor: c => U.fecha(c.aplicadoEn) },
      { titulo: 'Plano', render: c => c.planoGenerado
          ? UI.marca(U.cantidad(c.planoLineas) + ' líneas', 'ok')
          : UI.marca('sin generar', 'dato') }
    ], lista, { ordenPor: 'id', ordenDir: 'desc', vacio: 'Todavía no se ha importado ningún cobro.' });

    pintar([
      UI.titulo('Cobros', 'Cada pre-cobro mensual que entra a la base. El archivo original queda guardado tal como llegó.'),
      zona,
      UI.seccion('Cobros importados', null, tabla)
    ]);
  }

  function importar(file) {
    UI.aviso('Leyendo ' + file.name + '…');
    Cobro.leerArchivo(file).then(lectura => {
      const base = Modelo.obtener();
      const conc = Cobro.conciliar(lectura, { tolerancia: base.config.tolerancia });
      conciliacionActual = conc;
      verConciliacion(conc);
    }).catch(err => UI.aviso(err.message, 'mal'));
  }

  function verConciliacion(conc) {
    const l = conc.lectura;
    const yaExiste = Modelo.cobro(l.id);
    const primeraCarga = Modelo.vehiculos().length === 0;

    const campoId = el('input', { type: 'text', value: l.id || '', style: 'width:8rem' });
    const encabezado = el('div', { clase: 'panel' }, [
      el('h2', { texto: l.etiqueta }),
      el('p', { clase: 'ayuda', texto: [l.periodo, l.vigencia].filter(Boolean).join(' · ') }),
      UI.ficha([
        ['Archivo', l.nombreArchivo],
        ['Hoja leída', l.nombreHoja],
        ['Registros', U.cantidad(l.lineas.length)],
        ['Suma de las líneas', U.dinero(l.suma)],
        ['Total impreso', l.totalDeclarado === null ? '—' : U.dinero(l.totalDeclarado)],
        ['Identificador del mes', campoId]
      ])
    ]);

    if (l.totalDeclarado !== null && Math.round(l.totalDeclarado) !== Math.round(l.suma)) {
      encabezado.appendChild(el('div', { clase: 'alerta alerta--grave', style: 'margin-top:.8rem',
        texto: 'El total impreso en la factura no coincide con la suma de las líneas: ' +
               U.dinero(l.totalDeclarado) + ' contra ' + U.dinero(l.suma) + '.' }));
    }
    if (yaExiste) {
      encabezado.appendChild(el('div', { clase: 'alerta', style: 'margin-top:.8rem',
        texto: 'Ya existe un cobro para ' + U.mes(l.id) + '. Si lo aplicas otra vez se reemplazará.' }));
    }

    const secciones = [];

    if (primeraCarga) {
      secciones.push(el('div', { clase: 'alerta alerta--ok',
        texto: 'La base está vacía: este cobro la va a crear con ' + U.cantidad(l.lineas.length) + ' vehículos.' }));
    } else {
      const resumen = el('div', { clase: 'tarjetas' }, [
        UI.dato(U.cantidad(conc.nuevos.length), 'Vehículos nuevos', conc.nuevos.length ? 'alta' : null),
        UI.dato(U.cantidad(conc.faltantes.length), 'Ya no aparecen', conc.faltantes.length ? 'baja' : null),
        UI.dato(U.cantidad(conc.cambiosPrima.length), 'Cambios de valor', conc.cambiosPrima.length ? 'grave' : null),
        UI.dato(U.cantidad(conc.cambiosDatos.length), 'Cambios de datos', conc.cambiosDatos.length ? 'dato' : null),
        UI.dato(U.cantidad(conc.negativos.length), 'Valores negativos', conc.negativos.length ? 'dato' : null),
        UI.dato(U.cantidad(conc.sinNovedad.length), 'Sin novedad')
      ]);
      secciones.push(resumen);

      if (conc.cambiosPrima.length) {
        secciones.push(UI.seccion('Cambios en el valor', 'Diferencias por encima de la tolerancia de ' + U.dinero(conc.tolerancia) + '.',
          UI.tabla([
            { titulo: 'Placa', valor: x => x.vehiculo.placa, clase: 'mono' },
            { titulo: 'Asegurado', valor: x => x.vehiculo.nombreAsegurado },
            { titulo: 'Antes', clase: 'num', valor: x => U.dinero(x.antes) },
            { titulo: 'Ahora', clase: 'num', valor: x => U.dinero(x.ahora) },
            { titulo: 'Diferencia', clase: 'num', render: x => el('span', {
                clase: x.diferencia > 0 ? 'sube' : 'bajaval',
                texto: (x.diferencia > 0 ? '+' : '') + U.dinero(x.diferencia) }) },
            { titulo: 'Observación', render: x => x.esperado
                ? UI.marca(x.motivo, 'ok')
                : (x.ahora < 0 ? UI.marca('valor negativo', 'dato') : '—') }
          ], conc.cambiosPrima, { tono: x => (x.esperado ? 'ok' : 'grave') })));
      }

      if (conc.cambiosDatos.length) {
        secciones.push(UI.seccion('Cambios en los datos', 'La base se actualizará con estos valores.',
          UI.tabla([
            { titulo: 'Placa', valor: x => x.vehiculo.placa, clase: 'mono' },
            { titulo: 'Asegurado', valor: x => x.vehiculo.nombreAsegurado },
            { titulo: 'Qué cambió', render: x => {
                const f = document.createDocumentFragment();
                x.cambios.forEach(c => {
                  const linea = el('span', { clase: 'cambio' });
                  linea.appendChild(el('span', { style: 'color:var(--tinta-suave)', texto: c.etiqueta + ': ' }));
                  linea.appendChild(UI.cambio(c.antes, c.despues));
                  f.appendChild(linea);
                });
                return f;
              } },
            { titulo: 'Movimiento previo', render: x => x.movimiento
                ? UI.marca('confirma lo registrado', 'ok') : '—' }
          ], conc.cambiosDatos, { tono: () => 'dato' })));
      }

      if (conc.nuevos.length) {
        secciones.push(UI.seccion('Vehículos que entran', 'Se crearán en la base.',
          UI.tabla([
            { titulo: 'Placa', valor: x => x.linea.placa, clase: 'mono' },
            { titulo: 'Asegurado', valor: x => x.linea.nombreAsegurado },
            { titulo: 'Empleado', valor: x => x.linea.nombreEmpleado },
            { titulo: 'Vehículo', valor: x => [x.linea.clase, x.linea.marca, x.linea.modelo].filter(Boolean).join(' · ') },
            { titulo: 'Prima', clase: 'num', valor: x => U.dinero(x.linea.prima) },
            { titulo: 'Movimiento previo', render: x => x.movimiento
                ? UI.marca('inclusión registrada', 'ok') : UI.marca('sin registro previo', 'dato') }
          ], conc.nuevos, { tono: () => 'alta' })));
      }

      if (conc.faltantes.length) {
        secciones.push(UI.seccion('Vehículos que ya no aparecen', 'Quedarán marcados como excluidos.',
          UI.tabla([
            { titulo: 'Placa', valor: x => x.vehiculo.placa, clase: 'mono' },
            { titulo: 'Asegurado', valor: x => x.vehiculo.nombreAsegurado },
            { titulo: 'Prima que se cobraba', clase: 'num', valor: x => U.dinero(x.vehiculo.primaActual) },
            { titulo: 'Estado en la base', render: x => marcaVehiculo(x.vehiculo) },
            { titulo: 'Movimiento previo', render: x => x.movimiento
                ? UI.marca('exclusión registrada', 'ok') : UI.marca('salió sin aviso', 'grave') }
          ], conc.faltantes, { tono: () => 'baja' })));
      }

      if (conc.negativos.length) {
        secciones.push(UI.seccion('Valores negativos',
          'Son saldos a favor. Al generar el archivo plano la app te pedirá cruzarlos o eliminarlos.',
          UI.tabla([
            { titulo: 'Placa', valor: x => x.linea.placa, clase: 'mono' },
            { titulo: 'Empleado', valor: x => x.linea.nombreEmpleado },
            { titulo: 'Valor', clase: 'num', render: x => el('span', { clase: 'bajaval', texto: U.dinero(x.linea.prima) }) },
            { titulo: 'Otros vehículos del colaborador', valor: x => {
                const otros = Modelo.vehiculosDe(x.linea.ccEmpleado).filter(v => U.clave(v.placa) !== x.linea.placa);
                return otros.length ? otros.map(v => v.placa).join(', ') : 'ninguno';
              } }
          ], conc.negativos, { tono: () => 'dato' })));
      }
    }

    const acciones = el('div', { clase: 'titulo__acciones' }, [
      UI.boton('Cancelar', () => cobros(), 'boton--claro'),
      UI.boton('Aplicar a la base', () => {
        // Se acepta "2026-10" o "202610" y se normaliza a AAAA-MM.
        const idFinal = U.clave(campoId.value).replace(/^(\d{4})(\d{2})$/, '$1-$2');
        if (!/^\d{4}-\d{2}$/.test(idFinal)) {
          UI.aviso('El identificador del mes debe tener el formato AAAA-MM', 'mal'); return;
        }
        UI.confirmar('Aplicar el cobro',
          'Se actualizará la base con ' + U.cantidad(conc.lectura.lineas.length) + ' registros. ' +
          'Antes se guarda un respaldo automático.', 'Aplicar').then(ok => {
            if (!ok) return;
            Modelo.respaldar('Antes de aplicar ' + idFinal)
              .then(() => Cobro.aplicar(conc, { id: idFinal }))
              .then(hechos => {
                UI.aviso('Cobro aplicado: ' + hechos.creados + ' nuevos, ' + hechos.excluidos + ' excluidos', 'bien');
                conciliacionActual = null;
                App.ir('#/cobros');
              })
              .catch(err => UI.aviso('No se pudo aplicar: ' + err.message, 'mal'));
          });
      })
    ]);

    pintar([
      UI.titulo('Conciliación del cobro', 'Revisa qué va a cambiar antes de tocar la base.', [acciones]),
      encabezado
    ].concat(secciones));
  }

  /* ================================================================== PLANO */

  function plano() {
    const lista = Modelo.cobros();
    if (!lista.length) {
      pintar([
        UI.titulo('Archivo plano', 'Los descuentos que se envían a gestión humana.'),
        el('div', { clase: 'vacio', texto: 'Primero importa un cobro.' })
      ]);
      return;
    }

    const sel = selector('Cobro', lista.map(c => ({ valor: c.id, texto: U.mes(c.id) + ' · ' + c.etiqueta })),
      lista[0].id, () => { });

    const caja = el('div');

    const barra = el('div', { clase: 'barra' }, [
      el('label', { texto: 'Generar a partir de' }), sel,
      UI.boton('Preparar', () => preparar(sel.value))
    ]);

    function preparar(id) {
      U.vaciar(caja);
      caja.appendChild(el('p', { clase: 'ayuda', texto: 'Preparando…' }));
      Plano.preparar(id).then(prep => mostrar(prep)).catch(e => {
        U.vaciar(caja);
        caja.appendChild(el('div', { clase: 'alerta alerta--grave', texto: e.message }));
      });
    }

    function mostrar(prep) {
      const decisiones = {};
      U.vaciar(caja);

      const avisos = el('div');
      prep.avisos.forEach(a => avisos.appendChild(el('div', {
        clase: 'alerta' + (a.tipo === 'retirado' ? ' alerta--grave' : ''), texto: a.texto
      })));
      if (prep.avisos.length) caja.appendChild(avisos);

      if (prep.negativos.length) {
        const bloque = el('div');
        bloque.appendChild(el('p', { clase: 'ayuda',
          texto: 'Hay ' + prep.negativos.length + ' línea(s) con valor negativo. Decide qué hacer con cada una ' +
                 'antes de generar el archivo.' }));

        prep.negativos.forEach(neg => {
          const destinos = Plano.destinosPara(prep, neg);
          const fila = el('div', { clase: 'panel' });
          fila.appendChild(el('h2', { style: 'font-size:1rem', texto: neg.placa + ' · ' + (neg.nombreEmpleado || neg.ccEmpleado) }));
          fila.appendChild(el('p', { clase: 'ayuda',
            texto: 'Saldo a favor de ' + U.dinero(Math.abs(neg.valorOriginal)) + '. ' +
                   (destinos.length
                     ? 'El colaborador tiene ' + destinos.length + ' vehículo(s) más en este cobro.'
                     : 'El colaborador no tiene otro vehículo en este cobro.') }));

          const opciones = [{ valor: '', texto: '— sin decidir —' }];
          destinos.forEach(d => opciones.push({
            valor: 'cruzar:' + d.id,
            texto: 'Cruzar contra ' + d.placa + ' (' + U.dinero(d.valor) + ')'
          }));
          opciones.push({ valor: 'eliminar', texto: 'Eliminar la línea del archivo' });

          const resultado = el('p', { clase: 'ayuda' });
          const s = selector('Decisión', opciones, '', v => {
            if (!v) { delete decisiones[neg.id]; resultado.textContent = ''; actualizar(); return; }
            if (v === 'eliminar') {
              decisiones[neg.id] = { accion: 'eliminar' };
              resultado.textContent = 'La línea no se incluirá en el archivo.';
            } else {
              const destinoId = v.split(':')[1];
              const d = prep.filas.find(f => f.id === destinoId);
              decisiones[neg.id] = { accion: 'cruzar', destino: destinoId };
              const nuevo = Math.max(0, d.valorOriginal - Math.abs(neg.valorOriginal));
              resultado.textContent = 'El descuento de ' + d.placa + ' pasaría de ' +
                U.dinero(d.valorOriginal) + ' a ' + U.dinero(nuevo) + '.';
            }
            actualizar();
          });
          fila.appendChild(s);
          fila.appendChild(resultado);
          bloque.appendChild(fila);
        });

        caja.appendChild(UI.seccion('Valores negativos por resolver', null, bloque));
      }

      const zonaResultado = el('div', { clase: 'seccion' });
      caja.appendChild(zonaResultado);

      function actualizar() {
        // Se trabaja siempre sobre una copia limpia de los valores originales.
        prep.filas.forEach(f => { f.valor = f.valorOriginal; f.ajustes = []; });
        const r = Plano.resolver(prep, decisiones);

        U.vaciar(zonaResultado);
        zonaResultado.appendChild(el('h2', { texto: 'Resultado' }));

        const tarjetas = el('div', { clase: 'tarjetas' }, [
          UI.dato(U.cantidad(r.finales.length), 'Líneas del archivo'),
          UI.dato(U.dinero(r.total), 'Total a descontar'),
          UI.dato(U.dinero(r.totalOriginal), 'Suma del cobro'),
          UI.dato(U.cantidad(r.sinResolver.length), 'Negativos sin decidir', r.sinResolver.length ? 'grave' : null)
        ]);
        zonaResultado.appendChild(tarjetas);

        r.ajustes.forEach(a => {
          if (!a.texto) return;
          zonaResultado.appendChild(el('div', { clase: 'alerta', style: 'margin-top:.4rem', texto: a.texto }));
        });

        const pie = el('div', { clase: 'titulo__acciones', style: 'margin-top:1rem' }, [
          UI.boton('Ver las primeras líneas', () => {
            const muestra = Plano.texto(r.finales.slice(0, 15), Modelo.obtener().poliza.concepto)
              .replace(/\t/g, ' → ').replace(/\r\n/g, '\n');
            UI.modal({
              titulo: 'Vista previa',
              ayuda: 'Las flechas representan los tabuladores. El archivo real usa tabulador y salto CRLF.',
              cuerpo: el('pre', {
                texto: muestra,
                style: 'background:#f8fafc;padding:.8rem;border:1px solid var(--linea);overflow-x:auto;font-size:.82rem'
              })
            });
          }, 'boton--claro'),
          UI.boton('Generar archivo plano', () => {
            if (r.sinResolver.length) {
              UI.aviso('Faltan ' + r.sinResolver.length + ' negativo(s) por decidir', 'mal');
              return;
            }
            const contenido = Plano.texto(r.finales, Modelo.obtener().poliza.concepto);
            U.descargar(Plano.nombreArchivo(prep.idCobro), contenido, 'text/plain;charset=utf-8');
            Plano.registrar(prep.idCobro, r, contenido).then(() => {
              UI.aviso('Archivo generado: ' + r.finales.length + ' líneas por ' + U.dinero(r.total), 'bien');
            });
          })
        ]);
        zonaResultado.appendChild(pie);

        zonaResultado.appendChild(el('h2', { texto: 'Líneas', style: 'margin-top:1.4rem;font-size:1.05rem' }));
        zonaResultado.appendChild(UI.tabla([
          { titulo: 'Cédula', clave: 'ccEmpleado', clase: 'mono', orden: true },
          { titulo: 'Colaborador', clave: 'nombreEmpleado', orden: true },
          { titulo: 'Placa', clave: 'placa', clase: 'mono', orden: true },
          { titulo: 'Valor', clave: 'valor', clase: 'num', orden: true, render: f => {
              if (!f.ajustes.length) return U.dinero(f.valor);
              return el('span', {}, [
                el('span', { clase: 'antes', texto: U.dinero(f.valorOriginal) }),
                el('span', { clase: 'flecha', texto: '→' }),
                el('span', { clase: 'despues', texto: U.dinero(f.valor) })
              ]);
            } }
        ], r.finales, { ordenPor: 'nombreEmpleado', tono: f => (f.ajustes.length ? 'dato' : null) }));
      }

      actualizar();
    }

    preparar(sel.value);

    pintar([
      UI.titulo('Archivo plano', 'Cédula del empleado, concepto ' + Modelo.obtener().poliza.concepto +
        ' y valor, separados por tabulador. Es lo que se envía a gestión humana.'),
      barra, caja
    ]);
  }

  /* ================================================================ AJUSTES */

  function ajustes() {
    const base = Modelo.obtener();

    const fPoliza = UI.formulario([
      { nombre: 'numero', etiqueta: 'No. de póliza', valor: base.poliza.numero },
      { nombre: 'aseguradora', etiqueta: 'Aseguradora', valor: base.poliza.aseguradora },
      { nombre: 'concepto', etiqueta: 'Concepto de nómina', valor: base.poliza.concepto,
        ayuda: 'Va en la segunda columna del archivo plano.' },
      { nombre: 'vigenciaDesde', etiqueta: 'Vigencia desde', tipo: 'date', valor: base.poliza.vigenciaDesde },
      { nombre: 'vigenciaHasta', etiqueta: 'Vigencia hasta', tipo: 'date', valor: base.poliza.vigenciaHasta },
      { nombre: 'tolerancia', etiqueta: 'Tolerancia de prima ($)', tipo: 'number', valor: base.config.tolerancia,
        ayuda: 'Diferencias de este valor o menos no se reportan como cambio.' }
    ]);

    const panelPoliza = el('div', { clase: 'panel' }, [
      el('h2', { texto: 'Datos de la póliza' }),
      fPoliza.nodo,
      el('div', { clase: 'titulo__acciones', style: 'margin-top:.9rem' }, [
        UI.boton('Guardar', () => {
          const d = fPoliza.leer();
          base.poliza.numero = d.numero;
          base.poliza.aseguradora = d.aseguradora;
          base.poliza.concepto = String(d.concepto || '3055');
          base.poliza.vigenciaDesde = d.vigenciaDesde;
          base.poliza.vigenciaHasta = d.vigenciaHasta;
          base.config.tolerancia = Number(d.tolerancia) || 0;
          Modelo.guardar().then(() => { UI.aviso('Ajustes guardados', 'bien'); App.repintar(); });
        })
      ])
    ]);

    const modo = Almacen.estado.modo === 'carpeta'
      ? 'Carpeta del equipo: ' + Almacen.estado.nombreCarpeta
      : 'Dentro del navegador (no se eligió carpeta)';

    const panelDatos = el('div', { clase: 'panel' }, [
      el('h2', { texto: 'Dónde viven los datos' }),
      el('p', { clase: 'ayuda', texto: modo }),
      el('div', { clase: 'titulo__acciones' }, [
        UI.boton('Cambiar carpeta', () => {
          Almacen.elegirCarpeta()
            .then(() => Modelo.guardar())
            .then(() => { UI.aviso('Carpeta cambiada', 'bien'); App.repintar(); })
            .catch(e => UI.aviso(e.message, 'mal'));
        }, 'boton--claro'),
        UI.boton('Guardar un respaldo', () => {
          Modelo.respaldar('Respaldo manual').then(n => {
            UI.aviso(n ? 'Respaldo guardado' : 'No se pudo guardar el respaldo', n ? 'bien' : 'mal');
          });
        }, 'boton--claro'),
        UI.boton('Descargar la base', () => {
          U.descargar('base-poliza-' + U.hoyISO() + '.json', JSON.stringify(Modelo.obtener(), null, 2), 'application/json');
        }, 'boton--claro'),
        UI.boton('Cargar una base', () => cargarBase(), 'boton--claro')
      ])
    ]);

    const bitacora = base.auditoria.slice(0, 60);
    const panelBitacora = UI.seccion('Bitácora', 'Todo lo que ha cambiado en la base.',
      UI.tabla([
        { titulo: 'Fecha', valor: a => U.fechaHora(a.fecha) },
        { titulo: 'Acción', clave: 'accion' },
        { titulo: 'Detalle', clave: 'detalle' }
      ], bitacora, { vacio: 'Sin movimientos registrados todavía.' }));

    const saldos = (base.saldos || []).filter(s => s.restante < 0);
    const panelSaldos = saldos.length ? UI.seccion('Saldos a favor pendientes',
      'Remanentes de cruces que no alcanzaron a aplicarse completos.',
      UI.tabla([
        { titulo: 'Colaborador', valor: s => s.nombreEmpleado || s.ccEmpleado },
        { titulo: 'Placa de origen', clave: 'placa', clase: 'mono' },
        { titulo: 'Desde', valor: s => U.mes(s.cobro) },
        { titulo: 'Saldo', clase: 'num', valor: s => U.dinero(Math.abs(s.restante)) }
      ], saldos, {})) : null;

    pintar([
      UI.titulo('Ajustes', 'Parámetros de la póliza, almacenamiento y bitácora.'),
      panelPoliza, panelDatos, panelSaldos, panelBitacora
    ]);
  }

  function cargarBase() {
    const entrada = el('input', { type: 'file', accept: '.json' });
    entrada.addEventListener('change', () => {
      const f = entrada.files[0];
      if (!f) return;
      f.text().then(t => {
        let obj;
        try { obj = JSON.parse(t); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
        return UI.confirmar('Reemplazar la base',
          'Se perderá la base actual y quedará la del archivo. Se guarda un respaldo antes.', 'Reemplazar')
          .then(ok => {
            if (!ok) return;
            return Modelo.respaldar('Antes de cargar una base externa')
              .then(() => Modelo.importarBase(obj))
              .then(() => { UI.aviso('Base cargada', 'bien'); App.repintar(); });
          });
      }).catch(e => UI.aviso(e.message, 'mal'));
    });
    entrada.click();
  }

  return {
    inicio, vehiculos, colaboradores, movimientos, cobros, plano, ajustes,
    detalleVehiculo, detalleColaborador, nuevoMovimiento, verConciliacion
  };
})();
