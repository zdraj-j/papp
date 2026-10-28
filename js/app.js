/* ============================================================================
   App — arranque, portada y navegación
   ========================================================================== */
'use strict';

window.App = (function () {

  const el = U.el;
  const VISTAS = {
    inicio: Vistas.inicio,
    vehiculos: Vistas.vehiculos,
    colaboradores: Vistas.colaboradores,
    movimientos: Vistas.movimientos,
    cobros: Vistas.cobros,
    plano: Vistas.plano,
    ajustes: Vistas.ajustes
  };

  let vistaActual = 'inicio';

  /* ------------------------------------------------------------- portada */

  function portada(estado) {
    document.getElementById('app').hidden = true;
    document.getElementById('portada').hidden = false;
    const acciones = U.vaciar(document.getElementById('portadaAcciones'));
    const nota = document.getElementById('portadaNota');
    U.vaciar(nota);

    if (estado === 'sin-carpeta') {
      if (Almacen.estado.soportaCarpeta) {
        acciones.appendChild(UI.boton('Escoger carpeta de trabajo', () => {
          Almacen.elegirCarpeta().then(() => arrancar()).catch(e => UI.aviso(e.message, 'mal'));
        }));
        acciones.appendChild(UI.boton('Trabajar solo en el navegador', () => {
          Almacen.estado.modo = 'navegador';
          arrancar();
        }, 'boton--claro'));
        nota.appendChild(el('span', {
          texto: 'La carpeta guarda base.json, los cobros importados, los archivos planos y los respaldos. ' +
                 'Nada sale de tu equipo.'
        }));
      } else {
        acciones.appendChild(UI.boton('Continuar en el navegador', () => {
          Almacen.estado.modo = 'navegador';
          arrancar();
        }));
        nota.appendChild(el('strong', { texto: 'Este navegador no permite escoger una carpeta. ' }));
        nota.appendChild(el('span', {
          texto: 'Suele pasar al abrir el archivo con doble clic (file://). Usa la app publicada en GitHub Pages ' +
                 'para guardar en una carpeta; mientras tanto los datos quedan dentro del navegador y puedes ' +
                 'descargar la base desde Ajustes.'
        }));
      }
      return;
    }

    if (estado === 'permiso') {
      acciones.appendChild(UI.boton('Reconectar la carpeta «' + Almacen.estado.nombreCarpeta + '»', () => {
        Almacen.reconectar().then(ok => {
          if (ok) arrancar();
          else UI.aviso('No se concedió el permiso', 'mal');
        });
      }));
      acciones.appendChild(UI.boton('Escoger otra carpeta', () => {
        Almacen.elegirCarpeta().then(() => arrancar()).catch(e => UI.aviso(e.message, 'mal'));
      }, 'boton--claro'));
      nota.appendChild(el('span', {
        texto: 'El navegador pide permiso otra vez cada vez que se abre la app. Es un solo clic.'
      }));
      return;
    }

    if (estado === 'sin-base') {
      acciones.appendChild(UI.boton('Crear una base nueva', () => {
        Modelo.crear().then(() => {
          UI.aviso('Base creada. Ahora importa el último cobro.', 'bien');
          mostrarApp();
          ir('#/cobros');
        });
      }));
      acciones.appendChild(UI.boton('Cargar una base existente', () => {
        const entrada = el('input', { type: 'file', accept: '.json' });
        entrada.addEventListener('change', () => {
          const f = entrada.files[0];
          if (!f) return;
          f.text().then(t => Modelo.importarBase(JSON.parse(t)))
            .then(() => { mostrarApp(); ir('#/inicio'); })
            .catch(e => UI.aviso('No se pudo cargar: ' + e.message, 'mal'));
        });
        entrada.click();
      }, 'boton--claro'));

      nota.appendChild(el('span', {
        texto: Almacen.usaCarpeta()
          ? 'La carpeta «' + Almacen.estado.nombreCarpeta + '» está lista pero todavía no tiene una base. ' +
            'Crea una y luego importa el pre-cobro más reciente: ese archivo es el que llena la base.'
          : 'Los datos quedarán dentro de este navegador. Recuerda descargar la base de vez en cuando desde Ajustes.'
      }));
    }
  }

  /* ------------------------------------------------------------ navegación */

  function mostrarApp() {
    document.getElementById('portada').hidden = true;
    document.getElementById('app').hidden = false;
    document.getElementById('marcaPoliza').textContent = Modelo.obtener().poliza.numero || '';
    pintarEstadoAlmacen();
  }

  function pintarEstadoAlmacen() {
    const n = document.getElementById('estadoAlmacen');
    U.vaciar(n);
    if (Almacen.usaCarpeta()) {
      n.appendChild(document.createTextNode('Guardando en '));
      n.appendChild(el('b', { texto: Almacen.estado.nombreCarpeta }));
    } else if (Almacen.estado.modo === 'carpeta') {
      n.appendChild(el('b', { texto: 'Carpeta sin permiso' }));
      document.getElementById('btnReconectar').hidden = false;
    } else {
      n.appendChild(el('b', { texto: 'Datos en el navegador' }));
      n.appendChild(document.createTextNode('. Descarga la base desde Ajustes.'));
    }
  }

  function ir(hash) {
    if (location.hash === hash) enrutar();
    else location.hash = hash;
  }

  function enrutar() {
    if (!Modelo.hayBase()) return;
    const partes = (location.hash || '#/inicio').replace(/^#\//, '').split('/');
    const vista = VISTAS[partes[0]] ? partes[0] : 'inicio';
    vistaActual = vista;

    document.querySelectorAll('.menu a').forEach(a => {
      if (a.dataset.vista === vista) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    try {
      VISTAS[vista]();
    } catch (e) {
      console.error(e);
      UI.aviso('Error al dibujar la vista: ' + e.message, 'mal');
    }
  }

  function repintar() {
    pintarEstadoAlmacen();
    if (Modelo.hayBase()) enrutar();
  }

  /* -------------------------------------------------------------- arranque */

  function arrancar() {
    return Modelo.cargar().then(base => {
      if (!base) { portada('sin-base'); return; }
      mostrarApp();
      enrutar();
    }).catch(e => {
      UI.aviso('No se pudo leer la base: ' + e.message, 'mal');
      portada('sin-base');
    });
  }

  function iniciar() {
    window.addEventListener('hashchange', enrutar);
    document.getElementById('btnReconectar').addEventListener('click', () => {
      Almacen.reconectar().then(ok => {
        if (ok) { document.getElementById('btnReconectar').hidden = true; arrancar(); }
        else UI.aviso('No se concedió el permiso', 'mal');
      });
    });

    Almacen.iniciar().then(estado => {
      if (estado.modo === 'carpeta' && estado.permisoPendiente) { portada('permiso'); return; }
      if (estado.modo === 'carpeta') return arrancar();
      // Sin carpeta: puede haber datos guardados en el navegador de antes.
      return Modelo.cargar().then(base => {
        if (base) { mostrarApp(); enrutar(); }
        else portada('sin-carpeta');
      });
    }).catch(() => portada('sin-carpeta'));
  }

  document.addEventListener('DOMContentLoaded', iniciar);
  if (document.readyState !== 'loading') setTimeout(iniciar, 0);

  return { ir, repintar, enrutar, mostrarApp, portada, iniciar };
})();
