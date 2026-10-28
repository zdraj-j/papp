/* ============================================================================
   Utilidades compartidas
   ========================================================================== */
'use strict';

window.U = (function () {

  /* ------------------------------------------------------------- texto */

  /** Quita tildes, espacios repetidos y pasa a mayúsculas. */
  function norm(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  }

  /** Clave dura: solo letras y dígitos (placas, cédulas, pólizas). */
  function clave(v) {
    if (v === null || v === undefined) return '';
    return String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /** Cédula sin ceros a la izquierda, como texto. */
  function cedula(v) {
    const c = clave(v).replace(/^0+/, '');
    return c || '';
  }

  function titulo(v) {
    const t = String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
    return t.toLowerCase().replace(/(^|[\s(])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
  }

  /* ------------------------------------------------------------ números */

  const fmtPesos = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0
  });
  const fmtNum = new Intl.NumberFormat('es-CO');

  function dinero(n) {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '—';
    return fmtPesos.format(Math.round(n));
  }
  function cantidad(n) { return fmtNum.format(n || 0); }

  /** Convierte a número lo que venga de una celda ("$ 213.010", "213010", 213010). */
  function aNumero(v) {
    if (typeof v === 'number') return isNaN(v) ? null : v;
    if (v === null || v === undefined || v === '') return null;
    const limpio = String(v).replace(/[^\d,.\-]/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const n = parseFloat(limpio);
    return isNaN(n) ? null : n;
  }

  function pad(valor, largo) {
    let s = String(Math.abs(Math.round(valor || 0)));
    while (s.length < largo) s = '0' + s;
    return s;
  }

  /* ------------------------------------------------------------- fechas */

  function hoyISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  }

  function ahoraISO() { return new Date().toISOString(); }

  function fecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fechaHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  /** "2026-10" → "octubre de 2026" */
  function mes(id) {
    if (!id) return '—';
    const p = String(id).split('-');
    const d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
    if (isNaN(d)) return id;
    const t = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /* ----------------------------------------------------------------- id */

  function id(prefijo) {
    return prefijo + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ------------------------------------------------------------ dom */

  function el(etiqueta, opciones, hijos) {
    const n = document.createElement(etiqueta);
    const o = opciones || {};
    Object.keys(o).forEach(k => {
      if (k === 'clase') n.className = o[k];
      else if (k === 'texto') n.textContent = o[k];
      else if (k === 'html') n.innerHTML = o[k];
      else if (k === 'datos') Object.keys(o[k]).forEach(d => { n.dataset[d] = o[k][d]; });
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), o[k]);
      else if (o[k] !== null && o[k] !== undefined && o[k] !== false) n.setAttribute(k, o[k]);
    });
    (hijos || []).forEach(h => {
      if (h === null || h === undefined || h === false) return;
      n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
    });
    return n;
  }

  function vaciar(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }

  /* --------------------------------------------------------- entidades */

  const PALABRAS_ENTIDAD = ['BANCO', 'BANCOLOMBIA', 'FONDO', 'CAJA DE', 'FINANC', 'MOTOR',
    'COOPERATIV', 'LEASING', 'SEGUROS', 'LTDA', 'BIC', 'COMPAN', 'SERVICES', 'GRUPO',
    'INVERSIONES', 'CREDI', 'FIDU', 'COMFANDI', 'COMERCIALIZADORA', 'AUTOMOTRIZ'];

  function esEntidad(nombre) {
    const t = norm(nombre);
    if (!t) return false;
    if (/\bS\.?A\.?S?\.?$/.test(t) || /\bS\.?A\.?S?\.?\s/.test(t)) return true;
    return PALABRAS_ENTIDAD.some(p => t.indexOf(p) !== -1);
  }

  /** ¿Son el mismo nombre escrito distinto? (p. ej. falta un segundo nombre) */
  function mismoNombreParcial(a, b) {
    const ta = norm(a).split(' ').filter(x => x.length > 2);
    const tb = norm(b).split(' ').filter(x => x.length > 2);
    if (ta.length < 2 || tb.length < 2) return false;
    const corto = ta.length <= tb.length ? ta : tb;
    const largo = ta.length <= tb.length ? tb : ta;
    const comunes = corto.filter(x => largo.indexOf(x) !== -1).length;
    return comunes >= 2 && comunes === corto.length;
  }

  /** OK | ENTIDAD | PARCIAL | REVISAR */
  function revisarBeneficiario(nombreAsegurado, beneficiario) {
    const a = norm(nombreAsegurado), b = norm(beneficiario);
    if (!b) return 'REVISAR';
    if (a === b) return 'OK';
    if (esEntidad(beneficiario)) return 'ENTIDAD';
    if (mismoNombreParcial(nombreAsegurado, beneficiario)) return 'PARCIAL';
    return 'REVISAR';
  }

  /* -------------------------------------------------------- descargas */

  function descargar(nombre, contenido, tipo) {
    const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    norm, clave, cedula, titulo, dinero, cantidad, aNumero, pad,
    hoyISO, ahoraISO, fecha, fechaHora, mes, id, el, vaciar,
    esEntidad, mismoNombreParcial, revisarBeneficiario, descargar
  };
})();
