/* ============================================================================
   Almacén — dónde viven los datos
   ----------------------------------------------------------------------------
   Modo "carpeta": una carpeta del equipo elegida por el usuario, usando la
   File System Access API. Solo funciona en contexto seguro (https o localhost),
   por eso la app está pensada para GitHub Pages.

   Modo "navegador": si esa API no existe (por ejemplo al abrir el HTML con
   doble clic, file://), los archivos se guardan dentro de IndexedDB y el
   usuario exporta e importa la base a mano.
   ========================================================================== */
'use strict';

window.Almacen = (function () {

  const BD = 'poliza-autos';
  const TIENDA_META = 'meta';      // handle de la carpeta y preferencias
  const TIENDA_ARCH = 'archivos';  // respaldo cuando no hay carpeta

  const estado = {
    modo: 'ninguno',        // ninguno | carpeta | navegador
    carpeta: null,          // FileSystemDirectoryHandle
    nombreCarpeta: '',
    soportaCarpeta: typeof window.showDirectoryPicker === 'function',
    permisoPendiente: false
  };

  /* ------------------------------------------------------------ IndexedDB */

  let bdPromesa = null;

  function abrirBD() {
    if (bdPromesa) return bdPromesa;
    bdPromesa = new Promise((resolve, reject) => {
      const req = indexedDB.open(BD, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TIENDA_META)) db.createObjectStore(TIENDA_META);
        if (!db.objectStoreNames.contains(TIENDA_ARCH)) db.createObjectStore(TIENDA_ARCH);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return bdPromesa;
  }

  function idbLeer(tienda, llave) {
    return abrirBD().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(tienda, 'readonly').objectStore(tienda).get(llave);
      t.onsuccess = () => resolve(t.result);
      t.onerror = () => reject(t.error);
    }));
  }

  function idbEscribir(tienda, llave, valor) {
    return abrirBD().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(tienda, 'readwrite').objectStore(tienda).put(valor, llave);
      t.onsuccess = () => resolve(true);
      t.onerror = () => reject(t.error);
    }));
  }

  function idbLlaves(tienda) {
    return abrirBD().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(tienda, 'readonly').objectStore(tienda).getAllKeys();
      t.onsuccess = () => resolve(t.result || []);
      t.onerror = () => reject(t.error);
    }));
  }

  function idbBorrar(tienda, llave) {
    return abrirBD().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(tienda, 'readwrite').objectStore(tienda).delete(llave);
      t.onsuccess = () => resolve(true);
      t.onerror = () => reject(t.error);
    }));
  }

  /* ------------------------------------------------------- carpeta local */

  function permiso(handle, pedir) {
    if (!handle || !handle.queryPermission) return Promise.resolve('granted');
    const opciones = { mode: 'readwrite' };
    return handle.queryPermission(opciones).then(p => {
      if (p === 'granted') return p;
      if (!pedir) return p;
      return handle.requestPermission(opciones);
    });
  }

  /** Recupera la carpeta guardada. No pide permiso: eso exige un clic. */
  function iniciar() {
    return idbLeer(TIENDA_META, 'carpeta').then(handle => {
      if (!handle || !estado.soportaCarpeta) {
        estado.modo = 'navegador';
        return estado;
      }
      estado.carpeta = handle;
      estado.nombreCarpeta = handle.name;
      return permiso(handle, false).then(p => {
        if (p === 'granted') { estado.modo = 'carpeta'; estado.permisoPendiente = false; }
        else { estado.modo = 'carpeta'; estado.permisoPendiente = true; }
        return estado;
      });
    }).catch(() => { estado.modo = 'navegador'; return estado; });
  }

  /** Pide permiso otra vez (debe llamarse desde un clic del usuario). */
  function reconectar() {
    if (!estado.carpeta) return Promise.resolve(false);
    return permiso(estado.carpeta, true).then(p => {
      estado.permisoPendiente = p !== 'granted';
      return !estado.permisoPendiente;
    });
  }

  function elegirCarpeta() {
    if (!estado.soportaCarpeta) {
      return Promise.reject(new Error(
        'Este navegador no permite escoger una carpeta. Ocurre al abrir el archivo con doble clic (file://). ' +
        'Usa la app desde GitHub Pages, o trabaja en modo navegador y exporta la base a mano.'));
    }
    return window.showDirectoryPicker({ mode: 'readwrite', id: 'poliza-autos' }).then(handle => {
      estado.carpeta = handle;
      estado.nombreCarpeta = handle.name;
      estado.modo = 'carpeta';
      estado.permisoPendiente = false;
      return idbEscribir(TIENDA_META, 'carpeta', handle).then(() => estado);
    });
  }

  function olvidarCarpeta() {
    estado.carpeta = null; estado.nombreCarpeta = ''; estado.modo = 'navegador';
    return idbBorrar(TIENDA_META, 'carpeta').then(() => estado);
  }

  /** Navega/crea las subcarpetas de una ruta y devuelve [directorio, nombre]. */
  function resolver(ruta, crear) {
    const partes = ruta.split('/').filter(Boolean);
    const nombre = partes.pop();
    let p = Promise.resolve(estado.carpeta);
    partes.forEach(sub => {
      p = p.then(dir => dir.getDirectoryHandle(sub, { create: !!crear }));
    });
    return p.then(dir => [dir, nombre]);
  }

  function usaCarpeta() {
    return estado.modo === 'carpeta' && estado.carpeta && !estado.permisoPendiente;
  }

  /* ------------------------------------------------------------- lectura */

  function leerTexto(ruta) {
    if (usaCarpeta()) {
      return resolver(ruta, false)
        .then(([dir, nombre]) => dir.getFileHandle(nombre))
        .then(fh => fh.getFile())
        .then(f => f.text())
        .catch(() => null);
    }
    return idbLeer(TIENDA_ARCH, ruta).then(v => (v === undefined ? null : v));
  }

  function leerJSON(ruta) {
    return leerTexto(ruta).then(t => {
      if (t === null) return null;
      try { return JSON.parse(t); } catch (e) { throw new Error('El archivo ' + ruta + ' no es un JSON válido.'); }
    });
  }

  /* ------------------------------------------------------------ escritura */

  function escribirTexto(ruta, texto) {
    if (usaCarpeta()) {
      return resolver(ruta, true)
        .then(([dir, nombre]) => dir.getFileHandle(nombre, { create: true }))
        .then(fh => fh.createWritable())
        .then(w => w.write(texto).then(() => w.close()))
        .then(() => true);
    }
    return idbEscribir(TIENDA_ARCH, ruta, texto);
  }

  function escribirJSON(ruta, obj) {
    return escribirTexto(ruta, JSON.stringify(obj, null, 2));
  }

  function listar(prefijo) {
    if (usaCarpeta()) {
      const partes = prefijo.split('/').filter(Boolean);
      let p = Promise.resolve(estado.carpeta);
      partes.forEach(sub => { p = p.then(dir => dir.getDirectoryHandle(sub, { create: false })); });
      return p.then(dir => {
        const salida = [];
        const it = dir.values();
        function paso() {
          return it.next().then(r => {
            if (r.done) return salida;
            if (r.value.kind === 'file') salida.push(r.value.name);
            return paso();
          });
        }
        return paso();
      }).catch(() => []);
    }
    return idbLlaves(TIENDA_ARCH).then(ll => ll
      .filter(k => k.indexOf(prefijo) === 0)
      .map(k => k.slice(prefijo.length).replace(/^\//, '')));
  }

  function borrar(ruta) {
    if (usaCarpeta()) {
      return resolver(ruta, false)
        .then(([dir, nombre]) => dir.removeEntry(nombre))
        .then(() => true).catch(() => false);
    }
    return idbBorrar(TIENDA_ARCH, ruta);
  }

  /* --------------------------------------------------------- preferencias */

  function leerPref(llave) { return idbLeer(TIENDA_META, 'pref:' + llave); }
  function guardarPref(llave, valor) { return idbEscribir(TIENDA_META, 'pref:' + llave, valor); }

  return {
    estado, iniciar, elegirCarpeta, reconectar, olvidarCarpeta, usaCarpeta,
    leerTexto, leerJSON, escribirTexto, escribirJSON, listar, borrar,
    leerPref, guardarPref
  };
})();
