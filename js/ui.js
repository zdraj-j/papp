/* ============================================================================
   UI — piezas reutilizables: modal, avisos, tablas, formularios
   ========================================================================== */
'use strict';

window.UI = (function () {

  const el = U.el;

  /* ------------------------------------------------------------- avisos */

  function aviso(texto, tono) {
    const caja = document.getElementById('avisos');
    const n = el('div', { clase: 'nota-flotante' + (tono ? ' nota-flotante--' + tono : ''), texto });
    caja.appendChild(n);
    setTimeout(() => { if (n.parentNode) n.parentNode.removeChild(n); }, 4600);
  }

  /* -------------------------------------------------------------- modal */

  let cerrarActual = null;

  function modal(opciones) {
    const velo = document.getElementById('velo');
    const hoja = document.getElementById('hoja');
    U.vaciar(hoja);
    hoja.className = 'hoja' + (opciones.ancha ? ' hoja--ancha' : '');

    hoja.appendChild(el('h2', { texto: opciones.titulo }));
    if (opciones.ayuda) hoja.appendChild(el('p', { clase: 'ayuda', texto: opciones.ayuda }));
    if (opciones.cuerpo) hoja.appendChild(opciones.cuerpo);

    const pie = el('div', { clase: 'hoja__pie' });
    (opciones.acciones || []).forEach(a => {
      pie.appendChild(el('button', {
        type: 'button',
        clase: 'boton' + (a.clase ? ' ' + a.clase : ''),
        texto: a.texto,
        onclick: () => { if (a.accion) a.accion(); }
      }));
    });
    if (!opciones.sinCerrar) {
      pie.insertBefore(el('button', {
        type: 'button', clase: 'boton boton--claro', texto: opciones.textoCerrar || 'Cerrar',
        onclick: cerrar
      }), pie.firstChild);
    }
    hoja.appendChild(pie);

    velo.hidden = false;
    cerrarActual = cerrar;
    velo.onclick = e => { if (e.target === velo) cerrar(); };
    document.addEventListener('keydown', escapar);
    const primero = hoja.querySelector('input,select,textarea,button');
    if (primero) primero.focus();

    function cerrar() {
      velo.hidden = true;
      document.removeEventListener('keydown', escapar);
      cerrarActual = null;
      if (opciones.alCerrar) opciones.alCerrar();
    }
    function escapar(e) { if (e.key === 'Escape') cerrar(); }

    return { cerrar, hoja };
  }

  function cerrarModal() { if (cerrarActual) cerrarActual(); }

  function confirmar(titulo, texto, textoBoton) {
    return new Promise(resolve => {
      let resuelto = false;
      const m = modal({
        titulo,
        cuerpo: el('p', { texto, clase: 'ayuda' }),
        textoCerrar: 'Cancelar',
        acciones: [{
          texto: textoBoton || 'Continuar', clase: 'boton--peligro',
          accion: () => { resuelto = true; m.cerrar(); resolve(true); }
        }],
        alCerrar: () => { if (!resuelto) resolve(false); }
      });
    });
  }

  /* --------------------------------------------------------- formularios */

  /**
   * campos: [{ nombre, etiqueta, tipo, valor, opciones, ancho, requerido, ayuda }]
   * Devuelve { nodo, leer() }
   */
  function formulario(campos) {
    const nodo = el('div', { clase: 'campos' });
    const entradas = {};

    campos.forEach(c => {
      const caja = el('div', { clase: 'campo' + (c.ancho ? ' campo--ancho' : '') });
      caja.appendChild(el('label', { texto: c.etiqueta, for: 'f_' + c.nombre }));

      let entrada;
      if (c.tipo === 'select') {
        entrada = el('select', { id: 'f_' + c.nombre });
        (c.opciones || []).forEach(o => {
          const op = el('option', { value: o.valor, texto: o.texto });
          if (String(o.valor) === String(c.valor)) op.selected = true;
          entrada.appendChild(op);
        });
      } else if (c.tipo === 'textarea') {
        entrada = el('textarea', { id: 'f_' + c.nombre });
        entrada.value = c.valor === null || c.valor === undefined ? '' : c.valor;
      } else {
        entrada = el('input', { id: 'f_' + c.nombre, type: c.tipo || 'text' });
        entrada.value = c.valor === null || c.valor === undefined ? '' : c.valor;
        if (c.tipo === 'number') entrada.step = c.paso || 'any';
      }
      if (c.requerido) entrada.required = true;
      caja.appendChild(entrada);
      if (c.ayuda) caja.appendChild(el('p', { clase: 'ayuda', texto: c.ayuda, style: 'margin:.2rem 0 0;font-size:.76rem' }));
      entradas[c.nombre] = { entrada, campo: c };
      nodo.appendChild(caja);
    });

    function leer() {
      const salida = {};
      Object.keys(entradas).forEach(k => {
        const { entrada, campo } = entradas[k];
        let v = entrada.value;
        if (campo.tipo === 'number') v = v === '' ? null : Number(v);
        else if (typeof v === 'string') v = v.trim();
        salida[k] = v;
      });
      return salida;
    }

    return { nodo, leer, entradas };
  }

  /* -------------------------------------------------------------- tablas */

  /**
   * columnas: [{ clave, titulo, clase, orden:true, valor(fila), render(fila) }]
   * opciones: { alClic(fila), tono(fila), vacio:'texto' }
   */
  function tabla(columnas, filas, opciones) {
    const o = opciones || {};
    const caja = el('div', { clase: 'tabla-caja' });

    if (!filas.length) {
      return el('div', { clase: 'vacio', texto: o.vacio || 'No hay registros para mostrar.' });
    }

    const estado = { clave: o.ordenPor || null, dir: o.ordenDir || 'asc' };
    const t = el('table');
    const thead = el('thead');
    const trh = el('tr');

    columnas.forEach(c => {
      const th = el('th', { clase: (c.clase || '') + (c.orden ? ' orden' : ''), texto: c.titulo });
      if (c.orden) {
        if (estado.clave === c.clave) th.dataset.dir = estado.dir;
        th.addEventListener('click', () => {
          if (estado.clave === c.clave) estado.dir = estado.dir === 'asc' ? 'desc' : 'asc';
          else { estado.clave = c.clave; estado.dir = 'asc'; }
          pintar();
          trh.querySelectorAll('th').forEach(x => delete x.dataset.dir);
          th.dataset.dir = estado.dir;
        });
      }
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    t.appendChild(thead);

    const tbody = el('tbody');
    t.appendChild(tbody);
    caja.appendChild(t);

    function ordenar(lista) {
      if (!estado.clave) return lista;
      const col = columnas.find(c => c.clave === estado.clave);
      if (!col) return lista;
      const v = f => (col.valor ? col.valor(f) : f[col.clave]);
      const copia = lista.slice();
      copia.sort((a, b) => {
        const va = v(a), vb = v(b);
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return va - vb;
        return String(va).localeCompare(String(vb), 'es');
      });
      if (estado.dir === 'desc') copia.reverse();
      return copia;
    }

    function pintar() {
      U.vaciar(tbody);
      ordenar(filas).forEach(f => {
        const tr = el('tr');
        if (o.tono) { const t2 = o.tono(f); if (t2) tr.dataset.tono = t2; }
        if (o.alClic) {
          tr.className = 'clicable';
          tr.addEventListener('click', ev => {
            if (ev.target.closest('button,a,input,select')) return;
            o.alClic(f);
          });
        }
        columnas.forEach(c => {
          const td = el('td', { clase: c.clase || null });
          const contenido = c.render ? c.render(f) : (c.valor ? c.valor(f) : f[c.clave]);
          if (contenido instanceof Node) td.appendChild(contenido);
          else td.textContent = (contenido === null || contenido === undefined || contenido === '') ? '—' : String(contenido);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    pintar();
    return caja;
  }

  /* ------------------------------------------------------------- piezas */

  function marca(texto, tono) {
    return el('span', { clase: 'marca-estado' + (tono ? ' marca-estado--' + tono : ''), texto });
  }

  function dato(valor, etiqueta, tono) {
    return el('div', { clase: 'dato' + (tono ? ' dato--' + tono : '') }, [
      el('span', { clase: 'dato__valor', texto: valor }),
      el('span', { clase: 'dato__etiqueta', texto: etiqueta })
    ]);
  }

  function ficha(pares) {
    const d = el('dl', { clase: 'ficha' });
    pares.forEach(([k, v]) => {
      if (v === undefined) return;
      d.appendChild(el('div', {}, [
        el('dt', { texto: k }),
        (v instanceof Node) ? el('dd', {}, [v]) : el('dd', { texto: (v === null || v === '') ? '—' : String(v) })
      ]));
    });
    return d;
  }

  function cambio(antes, despues) {
    return el('span', { clase: 'cambio' }, [
      el('span', { clase: 'antes', texto: (antes === null || antes === '') ? '(vacío)' : String(antes) }),
      el('span', { clase: 'flecha', texto: '→' }),
      el('span', { clase: 'despues', texto: (despues === null || despues === '') ? '(vacío)' : String(despues) })
    ]);
  }

  function titulo(texto, descripcion, acciones) {
    return el('header', { clase: 'titulo' }, [
      el('div', {}, [
        el('h1', { texto }),
        descripcion ? el('p', { texto: descripcion }) : null
      ]),
      acciones && acciones.length ? el('div', { clase: 'titulo__acciones' }, acciones) : null
    ]);
  }

  function boton(texto, accion, clase) {
    return el('button', { type: 'button', clase: 'boton' + (clase ? ' ' + clase : ''), texto, onclick: accion });
  }

  function seccion(titulo, ayuda, contenido) {
    return el('section', { clase: 'seccion' }, [
      el('h2', { texto: titulo }),
      ayuda ? el('p', { clase: 'ayuda', texto: ayuda }) : null,
      contenido
    ]);
  }

  return { aviso, modal, cerrarModal, confirmar, formulario, tabla, marca, dato, ficha, cambio, titulo, boton, seccion };
})();
