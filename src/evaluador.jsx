import React, { useState, useMemo, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { Home, MapPin, Heart, Lock, Plus, X, Check, Trash2, ChevronDown, ChevronRight, AlertCircle, Search, ArrowLeft, Wallet, Award, Image as ImageIcon, Ruler, Info, Star, ListChecks, SlidersHorizontal, Settings, LogOut, UserCheck, Clock, HelpCircle, BookOpen, Map, Navigation } from 'lucide-react';
import { auth, googleProvider, db, storage } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, onSnapshot, collection, addDoc, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

// ============================================================
// CONSTANTES
// ============================================================

const ZONAS = [
  'Agronomía','Almagro','Balvanera','Barracas','Belgrano','Boedo','Caballito',
  'Chacarita','Coghlan','Colegiales','Constitución','Floresta','Flores','La Boca',
  'Liniers','Mataderos','Monserrat','Monte Castro','Nueva Pompeya','Núñez','Palermo',
  'Parque Avellaneda','Parque Chacabuco','Parque Chas','Parque Patricios','Paternal',
  'Puerto Madero','Recoleta','Retiro','Saavedra','San Cristóbal','San Nicolás',
  'San Telmo','Versalles','Villa Crespo','Villa del Parque','Villa Devoto',
  'Villa General Mitre','Villa Lugano','Villa Luro','Villa Ortúzar','Villa Pueyrredón',
  'Villa Real','Villa Riachuelo','Villa Santa Rita','Villa Soldati','Villa Urquiza','Otra'
];

const TIPOS = ['PH','Casa','Departamento','Otro'];
const SUBTIPOS = ['Estándar','Semipiso','Piso','Dúplex','Monoambiente','Loft','Penthouse','Triplex'];
const DISPOSICIONES = ['Frente','Contrafrente','Interior','Lateral'];
const ANUNCIANTES = ['Inmobiliaria','Dueño directo'];

// Pool completo de excluyentes disponibles — el usuario elige cuáles aplican en Configuración
const EXCLUYENTES_DISPONIBLES = [
  {id:'terraza',        label:'Terraza / Jardín / Patio'},
  {id:'banoCompleto',   label:'1 baño completo'},
  {id:'cocinaAmplia',   label:'Cocina amplia'},
  {id:'luminoso',       label:'Luminoso'},
  {id:'expensasBajas',  label:'Expensas bajas'},
  {id:'listoVivir',     label:'Listo para vivir'},
  {id:'gasNatural',     label:'Gas natural'},
  {id:'cochera',        label:'Cochera'},
  {id:'ascensor',       label:'Ascensor'},
  {id:'sinExpensas',    label:'Sin expensas'},
  {id:'aptCredito',     label:'Apto crédito'},
  {id:'extSpacious',    label:'Espacio exterior amplio'},
];

// Default de excluyentes activos (IDs)
const EXCLUYENTES_DEFAULT = ['terraza','banoCompleto','cocinaAmplia','luminoso','expensasBajas','listoVivir','gasNatural'];

// 12 criterios — todos manuales (slider 0-10 por propiedad)
const CRITERIOS_DEFAULT = [
  {id:'zonaDeseada',  label:'Zona deseada',                           peso:5, tipo:'manual'},
  {id:'distancia',    label:'Distancia a lugares de referencia',      peso:4, tipo:'manual'},
  {id:'tamano',       label:'Tamaño general (m² ponderados)',          peso:4, tipo:'manual'},
  {id:'ambientes',    label:'Cantidad de ambientes',                  peso:4, tipo:'manual'},
  {id:'estado',       label:'Estado / terminaciones',                 peso:3, tipo:'manual'},
  {id:'luminosidad',  label:'Luminosidad',                            peso:3, tipo:'manual'},
  {id:'exterior',     label:'Espacio exterior (terraza/balcón/jardín)',peso:4, tipo:'manual'},

  {id:'modificable',  label:'Posibilidad de modificar / ampliar',     peso:3, tipo:'manual'},
  {id:'tranquilidad', label:'Tranquilidad del barrio',                peso:3, tipo:'manual'},
  {id:'ruido',        label:'Ruido percibido',                        peso:2, tipo:'manual'},
  {id:'comodidades',  label:'Comodidades extra (parrilla/SUM/pileta)',peso:3, tipo:'manual'},
];

const ESTADOS = ['Para visitar','Visitada','Oferta hecha','En negociación','Descartada'];
const ORIENTACIONES = ['N','S','E','O','NE','NO','SE','SO'];
const CALEFACCIONES = ['Radiadores','Splits','Losa radiante','Otro'];
const EMPRESAS_LUZ = ['Edenor','Edesur','Otra'];

// Email del super-admin. Se aprueba automáticamente la primera vez.
// Para sumarlo a otro usuario, hacerlo desde "Gestionar usuarios".
const SUPER_ADMIN_EMAIL = 'jipochettino@gmail.com';
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// ============================================================
// CONTEXT — uid disponible en toda la app sin prop drilling
// ============================================================

const UserContext = createContext(null);
const useUser = () => useContext(UserContext);

// ============================================================
// TRACKING — métricas en /users/{uid}/stats/main
// ============================================================

const trackEvent = async (uid, campo, inc = 1) => {
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'users', uid, 'stats', 'main'), {
      [campo]: increment(inc),
      ultimaActualizacion: new Date().toISOString(),
    });
  } catch { /* doc puede no existir todavía */ }
};

const trackLogin = async (uid, email, displayName) => {
  if (!uid) return;
  try {
    const statsRef = doc(db, 'users', uid, 'stats', 'main');
    const ahora = new Date().toISOString();
    const hoy = ahora.slice(0, 10);
    const snap = await getDoc(statsRef);
    if (!snap.exists()) {
      await setDoc(statsRef, {
        email, displayName,
        fechaCreacionCuenta: ahora,
        ultimaActualizacion: ahora,
        ultimoLogin: ahora,
        ultimosLogins: [hoy],
        logins: 1,
        propiedadesCreadas: 0,
        propiedadesActivas: 0,
        propiedadesDescartadas: 0,
        favoritas: 0,
        comparadorAbierto: 0,
        detalleAbierto: 0,
        fotosSubidas: 0,
        mapaUsado: 0,
        criteriosEditados: 0,
        presupuestoEditado: 0,
        excluyentesEditados: 0,
        lugaresEditados: 0,
        onboardingCompleto: false,
        presupuestoConfigurado: false,
        criteriosConfigurados: false,
        lugaresReferenciaConfigurados: false,
      });
    } else {
      const data = snap.data();
      const logins = (data.ultimosLogins || []).filter(d => d !== hoy).slice(-9);
      logins.push(hoy);
      await updateDoc(statsRef, {
        logins: increment(1),
        ultimoLogin: ahora,
        ultimaActualizacion: ahora,
        ultimosLogins: logins,
        email, displayName,
      });
    }
  } catch (e) { console.error('trackLogin', e); }
};

const trackStatsSnapshot = async (uid, propiedades) => {
  if (!uid || !propiedades) return;
  try {
    await updateDoc(doc(db, 'users', uid, 'stats', 'main'), {
      propiedadesActivas: propiedades.filter(p => p.estado !== 'Descartada').length,
      propiedadesDescartadas: propiedades.filter(p => p.estado === 'Descartada').length,
      favoritas: propiedades.filter(p => p.favorita).length,
      ultimaActualizacion: new Date().toISOString(),
    });
  } catch { /* silent */ }
};

// ============================================================
// PALETA Y ESTILOS
// ============================================================

const c = {
  bg:'#F7F6F2', surface:'#FFFFFF', surfaceAlt:'#FBFAF7',
  text:'#1E2D4A',        // azul marino del logo Valora
  textMuted:'#5A6B82',   // versión suavizada del azul
  textSubtle:'#9AAABB',  // aún más suave
  border:'#EAE7E0', borderStrong:'#D5D1C7',
  accent:'#E8454A',      // coral del logo Valora
  accentDark:'#C93338', accentSoft:'#FEF0F0',
  green:'#3B6D11', greenSoft:'#EAF3DE',
  amber:'#BA7517', amberSoft:'#FAEEDA',
  red:'#A32D2D', redSoft:'#FCEBEB',
  purple:'#534AB7', purpleSoft:'#EEEDFE',
};

const shadow = { sm:'0 1px 2px rgba(30,45,74,0.06)', hover:'0 8px 28px rgba(30,45,74,0.14)', lg:'0 20px 60px rgba(30,45,74,0.25)' };
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ============================================================
// HELPERS
// ============================================================

const fmtUSD = n => (n==null||n===''||isNaN(n)) ? '—' : new Intl.NumberFormat('es-AR',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const fmtUSDk = n => (n==null||n===''||isNaN(n)) ? '—' : Math.abs(n)>=1000 ? `USD ${(n/1000).toFixed(0)}k` : fmtUSD(n);
const fmtNum = (n,d=0) => (n==null||n===''||isNaN(n)) ? '—' : new Intl.NumberFormat('es-AR',{maximumFractionDigits:d}).format(n);

const calcularPuntaje = (puntajes, criterios) => {
  let sN=0, sD=0;
  criterios.forEach(cr => {
    const s = puntajes?.[cr.id];
    if (s != null && !isNaN(s)) { sN += s * cr.peso; sD += 10 * cr.peso; }
  });
  return sD===0 ? 0 : Math.round((sN/sD)*100);
};

const colorPuntaje = p => p>=80 ? c.green : p>=60 ? c.amber : c.red;
const semaforoBg = p => p>=80 ? '#C0DD97' : p>=60 ? '#FAC775' : '#F7C1C1';
const cumpleExcluyentes = (prop, excluyentesActivos, ambientesMinimos) => {
  const activos = excluyentesActivos || EXCLUYENTES_DEFAULT;
  // Cochera se maneja desde Datos físicos, no como booleano manual
  const poolSinCochera = EXCLUYENTES_DISPONIBLES.filter(e => activos.includes(e.id) && e.id !== 'cochera');
  const cumpleBooleanos = poolSinCochera.every(e => prop.excluyentes?.[e.id]===true);
  // Cochera: si está activa como excluyente, chequear prop.cochera
  const cocheraActiva = activos.includes('cochera');
  const cumpleCochera = !cocheraActiva || prop.cochera === true;
  const minAmb = ambientesMinimos || 0;
  const cumpleAmbientes = minAmb === 0 || !prop.ambientes || prop.ambientes >= minAmb;
  return cumpleBooleanos && cumpleCochera && cumpleAmbientes;
};

const calcularAnalisis = (prop, pres, config) => {
  const com = config?.comisionPct ?? 4;
  const gas = config?.gastosPct ?? 2;
  const otros = config?.otrosPct ?? 0;
  const totalPct = com + gas + otros;
  const vP = ((pres?.ventaMin||0)+(pres?.ventaMax||0))/2;
  const total = vP + (pres?.ahorros||0) + (pres?.aportes||0);
  const precio = prop.precioPedido||0;
  const costo = precio * (1 + totalPct/100);
  const res = total - costo;
  const mRel = precio>0 ? res/precio : 0;
  const estado = !precio ? 'sin-datos' : res>=0&&mRel>=0.05 ? 'verde' : res>=0 ? 'amber' : 'rojo';
  return { resultado:res, costoTotal:costo, totalDisponible:total, ventaProm:vP, precio, comisionPct:com, gastosPct:gas, otrosPct:otros, totalPct, estado, margenRel:mRel };
};

const colorAnalisis = e => e==='verde'?{fg:c.green,bg:c.greenSoft,label:'Sobra'} : e==='amber'?{fg:c.amber,bg:c.amberSoft,label:'Justo'} : e==='rojo'?{fg:c.red,bg:c.redSoft,label:'Falta'} : {fg:c.textMuted,bg:'#F0EFEB',label:'—'};


// ============================================================
// ONBOARDING — SLIDES Y GUÍA
// ============================================================

const ONBOARDING_SLIDES = [
  {
    emoji: '🏠',
    titulo: '¿Qué es Valora?',
    cuerpo: 'Es tu espacio para evaluar y comparar propiedades mientras buscás casa. Cargás las que te interesan, las puntuás según lo que más te importa, y Valora te dice cuál gana.',
    hint: 'Empezá cargando tu primera propiedad con el botón "Nueva propiedad".',
  },
  {
    emoji: '⚖️',
    titulo: 'Pesos vs. Excluyentes',
    cuerpo: 'Son dos cosas distintas:\n\n• Pesos: qué tan importante es cada criterio (del 1 al 5). Una propiedad puede tener cochera o no, y eso suma o resta al puntaje.\n\n• Excluyentes: es sí o no. Si una propiedad no cumple un excluyente activo, queda descartada automáticamente — no importa qué puntaje tenga.',
    hint: 'Ejemplo: si tenés "Mínimo 3 ambientes" como excluyente, un monoambiente ni aparece en el ranking.',
  },
  {
    emoji: '💰',
    titulo: 'Análisis de compra',
    cuerpo: 'Cargás tu presupuesto una sola vez (venta + ahorros + aportes) y Valora calcula automáticamente si cada propiedad entra en tu rango, considerando comisión y gastos.\n\nEsto es privado — solo lo ven los admins.',
    hint: 'Los parámetros (comisión, gastos, otros) se configuran en la sección Configuración.',
  },
  {
    emoji: '❓',
    titulo: '¿Necesitás ayuda?',
    cuerpo: 'Encontrás la guía completa de Valora en cualquier momento tocando el ícono (?) en la barra superior derecha.',
    hint: 'Listo para arrancar. ¡Cargá tu primera propiedad!',
  },
];

const GUIA_SECCIONES = [
  {
    id: 'propiedades',
    titulo: 'Propiedades',
    emoji: '🏠',
    contenido: 'Es la vista principal. Cada propiedad tiene una card con su puntaje, precio y análisis financiero. Podés filtrar por zona, estado y favoritas.\n\nHacé clic en una propiedad para ver y editar todos sus datos: identificación, datos físicos, financieros, comodidades, puntajes y más.',
  },
  {
    id: 'ranking',
    titulo: 'Ranking',
    emoji: '🏆',
    contenido: 'Las propiedades se ordenan automáticamente de mayor a menor puntaje. Solo aparecen las que cumplen todos los excluyentes activos y no están descartadas.\n\nEl top 3 se destaca en cards grandes. El resto aparece en lista.',
  },
  {
    id: 'pesos',
    titulo: 'Pesos',
    emoji: '⚖️',
    contenido: 'Cada criterio tiene un peso del 1 al 5. Cuanto más alto, más influye en el puntaje final.\n\nEl puntaje de una propiedad es: Σ(puntaje × peso) / Σ(10 × peso) × 100.\n\nEjemplo: si "Espacio exterior" tiene peso 5 y le ponés 8/10, eso pesa mucho más que "Ruido percibido" con peso 2.',
  },
  {
    id: 'excluyentes',
    titulo: 'Excluyentes',
    emoji: '🚫',
    contenido: 'Son filtros duros. Si una propiedad no cumple TODOS los excluyentes activos, queda descartada automáticamente — no aparece en el ranking.\n\nDistinto de los pesos: acá no hay matices. Es sí o no.\n\nConfigurás cuáles excluyentes están activos en la sección Configuración.',
  },
  {
    id: 'presupuesto',
    titulo: 'Presupuesto',
    emoji: '💰',
    contenido: 'Cargás una sola vez tus fuentes de fondos: venta de tu propiedad actual (rango mínimo y máximo), ahorros propios y aportes adicionales.\n\nValora suma todo y lo compara contra el costo de cada propiedad (precio + comisión + gastos). El resultado aparece en verde, ámbar o rojo en cada propiedad.\n\nEsto es privado — solo lo ven los admins.',
  },
  {
    id: 'configuracion',
    titulo: 'Configuración',
    emoji: '⚙️',
    contenido: 'Acá personalizás Valora para tu búsqueda:\n\n• Parámetros de compra: comisión, gastos de escritura y otros (reformas, mudanza). Afectan el análisis de todas las propiedades.\n\n• Barrios deseados: los que seleccionás influyen en el criterio "Zona deseada".\n\n• Excluyentes: elegís cuáles están activos para tu búsqueda.\n\n• Lugares de referencia: guardás direcciones (trabajo, colegio) para calcular distancias con Google Maps (próximamente).',
  },
  {
    id: 'descartadas',
    titulo: 'Descartadas',
    emoji: '🗑️',
    contenido: 'Las propiedades que marcaste como "Descartada" o que no cumplen tus excluyentes activos aparecen acá.\n\nDesde esta vista podés recuperarlas si cambiás de opinión (solo admins).',
  },
];

// ============================================================
// LOGO SVG VALORA
// ============================================================

const LogoV = ({ size=32 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill={c.accent}/>
    <path d="M8 10L20 30L32 10H26L20 22L14 10H8Z" fill="white"/>
  </svg>
);

// ============================================================
// COMPONENTES UI
// ============================================================

const Card = ({ children, style={}, onClick, hoverable=false }) => {
  const [h,setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>hoverable&&setH(true)} onMouseLeave={()=>hoverable&&setH(false)}
      style={{ background:c.surface, border:`1px solid ${c.border}`, borderRadius:14, boxShadow:hoverable&&h?shadow.hover:shadow.sm, transition:'box-shadow 200ms, transform 200ms', transform:hoverable&&h?'translateY(-2px)':'none', cursor:onClick?'pointer':'default', overflow:'hidden', ...style }}>
      {children}
    </div>
  );
};

const Button = ({ children, onClick, variant='secondary', size='md', style={}, disabled=false }) => {
  const [h,setH] = useState(false);
  const sz = { sm:{padding:'6px 12px',fontSize:13}, md:{padding:'9px 16px',fontSize:14} };
  const vr = {
    primary:{background:h?c.accentDark:c.accent,color:'white',border:'none'},
    secondary:{background:h?c.surfaceAlt:c.surface,color:c.text,border:`1px solid ${c.borderStrong}`},
    ghost:{background:h?c.surfaceAlt:'transparent',color:c.text,border:'1px solid transparent'},
    danger:{background:h?c.redSoft:c.surface,color:c.red,border:`1px solid ${c.border}`},
  };
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ ...sz[size], ...vr[variant], borderRadius:10, fontWeight:500, fontFamily:FONT, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.5:1, display:'inline-flex', alignItems:'center', gap:6, justifyContent:'center', transition:'all 150ms', ...style }}>
      {children}
    </button>
  );
};

const iS = { width:'100%', padding:'10px 14px', border:`1px solid ${c.border}`, borderRadius:10, fontSize:14, fontFamily:FONT, background:c.surface, outline:'none', boxSizing:'border-box', color:c.text };

const TextInput = React.memo(({ defaultValue, onCommit, type='text', placeholder, style={} }) => (
  <input type={type} defaultValue={defaultValue??''} placeholder={placeholder}
    onFocus={e=>{e.target.style.borderColor=c.accent; e.target.style.boxShadow=`0 0 0 3px ${c.accentSoft}`;}}
    onBlur={e=>{const v=type==='number'?(e.target.value===''?'':parseFloat(e.target.value)):e.target.value; onCommit(v); e.target.style.borderColor=c.border; e.target.style.boxShadow='none';}}
    style={{ ...iS, ...style }} />
));

const TextArea = React.memo(({ defaultValue, onCommit, placeholder, rows=3 }) => (
  <textarea defaultValue={defaultValue??''} placeholder={placeholder} rows={rows}
    onFocus={e=>{e.target.style.borderColor=c.accent; e.target.style.boxShadow=`0 0 0 3px ${c.accentSoft}`;}}
    onBlur={e=>{onCommit(e.target.value); e.target.style.borderColor=c.border; e.target.style.boxShadow='none';}}
    style={{ ...iS, resize:'vertical', lineHeight:1.5 }} />
));

const Select = React.memo(({ value, onChange, options, placeholder }) => (
  <select value={value??''} onChange={e=>onChange(e.target.value)}
    style={{ ...iS, cursor:'pointer', appearance:'none', backgroundImage:`url("data:image/svg+xml;charset=US-ASCII,%3Csvg width='12' height='8' viewBox='0 0 12 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%235A6B82' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 14px center', paddingRight:36 }}>
    <option value="">{placeholder||'Seleccionar...'}</option>
    {options.map(o => <option key={typeof o==='string'?o:o.value} value={typeof o==='string'?o:o.value}>{typeof o==='string'?o:o.label}</option>)}
  </select>
));

const Toggle = ({ checked, onChange, label }) => (
  <label style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer', padding:'6px 0' }}>
    <div onClick={()=>onChange(!checked)} style={{ width:38, height:22, borderRadius:11, background:checked?c.accent:'#D5D1C7', position:'relative', transition:'background 200ms', flexShrink:0 }}>
      <div style={{ width:18, height:18, borderRadius:'50%', background:'white', position:'absolute', top:2, left:checked?18:2, transition:'left 200ms', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
    </div>
    <span style={{ fontSize:14, color:c.text }}>{label}</span>
  </label>
);

const Slider = ({ value, onChange, min=0, max=10, label, weight, disabled=false }) => (
  <div style={{ marginBottom:14 }}>
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
      <span style={{ fontSize:13, color:disabled?c.textSubtle:c.text }}>{label}{weight!=null && <span style={{ color:c.textSubtle, fontSize:11, marginLeft:6 }}>peso {weight}</span>}</span>
      <span style={{ fontSize:13, fontWeight:600, color:disabled?c.textSubtle:c.accent }}>{value??0}</span>
    </div>
    <input type="range" min={min} max={max} value={value??0} disabled={disabled} onChange={e=>onChange(parseInt(e.target.value))} style={{ width:'100%', accentColor:c.accent, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.5:1 }} />
  </div>
);

const Badge = ({ children, color, bg, style={} }) => (
  <span style={{ fontSize:11, fontWeight:500, padding:'4px 10px', borderRadius:20, background:bg||'#F0EFEB', color:color||c.textMuted, display:'inline-flex', alignItems:'center', gap:5, ...style }}>{children}</span>
);

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{ border:`1px solid ${active?c.text:c.borderStrong}`, background:active?c.text:c.surface, color:active?'white':c.text, padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:FONT, transition:'all 150ms', whiteSpace:'nowrap' }}>{children}</button>
);

const Field = ({ label, locked, children, hint }) => (
  <div style={{ marginBottom:14 }}>
    <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:500, color:c.textMuted, marginBottom:6 }}>
      {locked && <Lock size={10} style={{ color:c.accent }} />}
      {label}
    </label>
    {children}
    {hint && <div style={{ fontSize:11, color:c.textSubtle, marginTop:5 }}>{hint}</div>}
  </div>
);


// ============================================================
// MODAL ONBOARDING (primera vez)
// ============================================================

const OnboardingModal = ({ onClose }) => {
  const [slide, setSlide] = React.useState(0);
  const total = ONBOARDING_SLIDES.length;
  const s = ONBOARDING_SLIDES[slide];
  const esUltimo = slide === total - 1;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,16,28,0.6)', backdropFilter:'blur(6px)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:c.surface, borderRadius:20, padding:36, maxWidth:480, width:'100%', boxShadow:'0 24px 64px rgba(30,45,74,0.25)', fontFamily:FONT }}>
        {/* Progress dots */}
        <div style={{ display:'flex', gap:6, justifyContent:'center', marginBottom:28 }}>
          {ONBOARDING_SLIDES.map((_,i) => (
            <div key={i} style={{ width: i===slide?24:8, height:8, borderRadius:4, background:i===slide?c.accent:c.border, transition:'all 250ms' }} />
          ))}
        </div>

        {/* Slide content */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:48, marginBottom:16, lineHeight:1 }}>{s.emoji}</div>
          <h2 style={{ margin:'0 0 12px', fontSize:22, fontWeight:700, letterSpacing:'-0.01em', color:c.text }}>{s.titulo}</h2>
          <p style={{ margin:'0 0 16px', fontSize:14, color:c.textMuted, lineHeight:1.7, whiteSpace:'pre-line' }}>{s.cuerpo}</p>
          {s.hint && (
            <div style={{ padding:'10px 16px', background:c.accentSoft, borderRadius:10, fontSize:13, color:c.accent, fontWeight:500 }}>
              {s.hint}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          {slide > 0 && (
            <Button variant="ghost" onClick={() => setSlide(s => s-1)}>Anterior</Button>
          )}
          {!esUltimo ? (
            <Button variant="primary" onClick={() => setSlide(s => s+1)} style={{ flex:1 }}>
              Siguiente →
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose} style={{ flex:1 }}>
              ¡Arrancar! 🚀
            </Button>
          )}
        </div>

        {/* Skip */}
        {!esUltimo && (
          <div style={{ textAlign:'center', marginTop:14 }}>
            <button onClick={onClose} style={{ border:'none', background:'transparent', fontSize:12, color:c.textSubtle, cursor:'pointer', fontFamily:FONT }}>
              Saltar intro
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// MODAL GUÍA COMPLETA (ícono ?)
// ============================================================

const GuiaModal = ({ onClose }) => {
  const [secActiva, setSecActiva] = React.useState('propiedades');
  const sec = GUIA_SECCIONES.find(s => s.id === secActiva);

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(20,16,28,0.5)', backdropFilter:'blur(4px)', zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflow:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:c.surface, borderRadius:16, maxWidth:680, width:'100%', boxShadow:'0 20px 60px rgba(30,45,74,0.25)', fontFamily:FONT, overflow:'hidden' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:`1px solid ${c.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:700, letterSpacing:'-0.01em' }}>Cómo funciona Valora</h2>
            <p style={{ margin:'4px 0 0', fontSize:13, color:c.textMuted }}>Guía de uso completa</p>
          </div>
          <button onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', color:c.textMuted, padding:4 }}><X size={20} /></button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'200px 1fr' }}>
          {/* Sidebar */}
          <div style={{ borderRight:`1px solid ${c.border}`, padding:'12px 8px' }}>
            {GUIA_SECCIONES.map(s => (
              <button key={s.id} onClick={() => setSecActiva(s.id)}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', width:'100%', border:'none', borderRadius:10,
                  background: secActiva===s.id ? c.accentSoft : 'transparent',
                  color: secActiva===s.id ? c.accent : c.text,
                  fontWeight: secActiva===s.id ? 600 : 400,
                  fontSize:13, fontFamily:FONT, cursor:'pointer', textAlign:'left', transition:'all 150ms' }}
                onMouseEnter={e=>{ if(secActiva!==s.id) e.currentTarget.style.background=c.surfaceAlt; }}
                onMouseLeave={e=>{ if(secActiva!==s.id) e.currentTarget.style.background='transparent'; }}>
                <span style={{ fontSize:16 }}>{s.emoji}</span>
                {s.titulo}
              </button>
            ))}
          </div>

          {/* Contenido */}
          <div style={{ padding:'28px 28px' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>{sec.emoji}</div>
            <h3 style={{ margin:'0 0 14px', fontSize:18, fontWeight:700, color:c.text }}>{sec.titulo}</h3>
            <p style={{ margin:0, fontSize:14, color:c.textMuted, lineHeight:1.8, whiteSpace:'pre-line' }}>{sec.contenido}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PANTALLA DE LOGIN
// ============================================================

const LoginScreen = ({ onLogin, error }) => (
  <div style={{ minHeight:'100vh', background:c.bg, fontFamily:FONT, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
    <Card style={{ maxWidth:420, width:'100%', padding:40, textAlign:'center' }}>
      <div style={{ display:'flex', justifyContent:'center', marginBottom:20 }}>
        <LogoV size={56} />
      </div>
      <h1 style={{ margin:'0 0 4px', fontSize:26, fontWeight:700, letterSpacing:'-0.01em', color:c.text }}>Valora</h1>
      <p style={{ margin:'0 0 6px', fontSize:13, color:c.textMuted, fontStyle:'italic' }}>Buscás en Zonaprop, decidís en Valora.</p>
      <p style={{ margin:'0 0 28px', fontSize:13, color:c.textSubtle }}>Iniciá sesión con Google para acceder</p>

      <Button variant="primary" onClick={onLogin} style={{ width:'100%', padding:'12px 16px', fontSize:14 }}>
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path fill="#FFF" d="M16.51 8.18c0-.57-.05-1.12-.14-1.65H9v3.12h4.21c-.18.99-.74 1.83-1.58 2.39v1.98h2.55c1.49-1.37 2.34-3.4 2.34-5.84z"/>
          <path fill="#FFF" d="M9 17c2.14 0 3.94-.71 5.25-1.92l-2.55-1.98c-.71.48-1.61.76-2.7.76-2.07 0-3.83-1.4-4.46-3.28H1.91v2.05A8 8 0 0 0 9 17z"/>
          <path fill="#FFF" d="M4.54 10.58a4.8 4.8 0 0 1 0-3.07V5.46H1.91a8.01 8.01 0 0 0 0 7.18l2.63-2.06z"/>
          <path fill="#FFF" d="M9 4.25c1.17 0 2.21.4 3.04 1.19l2.27-2.27C13 1.96 11.2 1 9 1 5.52 1 2.55 3.05 1.91 5.95L4.54 8c.63-1.88 2.39-3.75 4.46-3.75z"/>
        </svg>
        Iniciar sesión con Google
      </Button>

      {error && (
        <div style={{ marginTop:16, padding:12, background:c.redSoft, color:c.red, borderRadius:10, fontSize:13, display:'flex', alignItems:'center', gap:8, textAlign:'left' }}>
          <AlertCircle size={14} style={{ flexShrink:0 }} /> {error}
        </div>
      )}

      <div style={{ marginTop:20, fontSize:12, color:c.textSubtle }}>
        El acceso requiere aprobación. Si es tu primera vez, vas a quedar en lista de espera hasta que un admin te apruebe.
      </div>
    </Card>
  </div>
);


// ============================================================
// MODAL MIGRACIÓN — botón temporal para copiar datos viejos al nuevo esquema
// ============================================================

const MigracionModal = ({ uid, onClose }) => {
  const [estado, setEstado] = useState('idle');
  const [log, setLog] = useState([]);
  const agregar = (msg) => setLog(prev => [...prev, msg]);

  const migrar = async () => {
    setEstado('migrando');
    setLog([]);
    try {
      agregar('📦 Leyendo propiedades del esquema viejo...');
      const propsSnap = await getDocs(collection(db, 'propiedades'));
      agregar(`✅ ${propsSnap.docs.length} propiedades encontradas`);

      agregar('📦 Leyendo configuración vieja...');
      const configSnap = await getDoc(doc(db, 'config', 'main'));
      if (configSnap.exists()) agregar('✅ Config encontrada');
      else agregar('⚠️ Config no encontrada — se usarán defaults');

      agregar('🔄 Copiando propiedades al nuevo esquema...');
      for (const d of propsSnap.docs) {
        await setDoc(doc(db, 'users', uid, 'propiedades', d.id), d.data());
      }
      agregar(`✅ ${propsSnap.docs.length} propiedades copiadas`);

      if (configSnap.exists()) {
        agregar('🔄 Copiando configuración...');
        await setDoc(doc(db, 'users', uid, 'config', 'main'), configSnap.data());
        agregar('✅ Config copiada');
      }

      agregar('');
      agregar('🎉 Migración completa. Recargá la página.');
      agregar('Después podés borrar /propiedades y /config desde Firebase Console.');
      setEstado('ok');
    } catch (e) {
      agregar(`❌ Error: ${e.message}`);
      setEstado('error');
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(20,16,28,0.6)', backdropFilter:'blur(6px)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:c.surface, borderRadius:20, padding:32, maxWidth:520, width:'100%', boxShadow:shadow.lg, fontFamily:FONT }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <h2 style={{ margin:0, fontSize:20, fontWeight:700 }}>Migrar datos</h2>
            <p style={{ margin:'4px 0 0', fontSize:13, color:c.textMuted }}>Copia tus datos al nuevo esquema por usuario</p>
          </div>
          {estado !== 'migrando' && <button onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', color:c.textMuted }}><X size={20} /></button>}
        </div>

        {estado === 'idle' && (
          <>
            <div style={{ padding:14, background:c.amberSoft, borderRadius:10, fontSize:13, color:c.amber, marginBottom:20, lineHeight:1.6 }}>
              <strong>¿Qué hace esto?</strong> Copia tus propiedades y configuración al nuevo esquema privado por usuario. Las colecciones viejas quedan intactas — las borrás vos después desde Firebase Console cuando confirmes que todo está OK.
            </div>
            <Button variant="primary" onClick={migrar} style={{ width:'100%' }}>Iniciar migración</Button>
          </>
        )}

        {(estado === 'migrando' || estado === 'ok' || estado === 'error') && (
          <div style={{ background:'#1E2D4A', borderRadius:10, padding:16, fontFamily:'monospace', fontSize:12, color:'#C0DD97', maxHeight:280, overflowY:'auto' }}>
            {log.map((l,i) => <div key={i} style={{ marginBottom:4, color:l.startsWith('❌')?'#F7C1C1':l.startsWith('⚠️')?'#FAC775':'#C0DD97' }}>{l||'\u00A0'}</div>)}
            {estado === 'migrando' && <div style={{ color:'#9AAABB' }}>...</div>}
          </div>
        )}

        {estado === 'ok' && (
          <Button variant="primary" onClick={()=>window.location.reload()} style={{ width:'100%', marginTop:16 }}>
            Recargar la app
          </Button>
        )}
      </div>
    </div>
  );
};

// ============================================================
// PANTALLA DE ESPERA
// ============================================================

const WaitingScreen = ({ user, onLogout }) => (
  <div style={{ minHeight:'100vh', background:c.bg, fontFamily:FONT, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
    <Card style={{ maxWidth:440, width:'100%', padding:40, textAlign:'center' }}>
      <div style={{ width:60, height:60, borderRadius:'50%', background:c.amberSoft, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
        <Clock size={28} style={{ color:c.amber }} />
      </div>
      <h1 style={{ margin:'0 0 8px', fontSize:22, fontWeight:700 }}>Esperando aprobación</h1>
      <p style={{ margin:'0 0 8px', fontSize:14, color:c.textMuted }}>Ingresaste con <strong>{user.email}</strong></p>
      <p style={{ margin:'0 0 28px', fontSize:13, color:c.textMuted }}>Un admin tiene que aprobar tu acceso.</p>
      <Button variant="secondary" onClick={onLogout} style={{ width:'100%' }}><LogOut size={14} /> Cerrar sesión</Button>
    </Card>
  </div>
);

// ============================================================
// NAVBAR
// ============================================================

const NavBar = ({ view, setView, currentUser, isAdmin, propiedades, pendientes, onLogout, onAbrirGestionUsuarios, onAbrirGuia, onAbrirMigracion, migracionDisponible }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  const items = [
    { id:'lista', label:'Propiedades', icon:Home },
    { id:'ranking', label:'Ranking', icon:Award },
    { id:'descartadas', label:'Descartadas', icon:X },
    { id:'pesos', label:'Pesos', icon:SlidersHorizontal },
    ...(isAdmin ? [
      { id:'presupuesto', label:'Presupuesto', icon:Wallet, locked:true },
      { id:'configuracion', label:'Configuración', icon:Settings, locked:true },
    ] : []),
  ];

  const inicial = (currentUser.displayName || currentUser.email)[0].toUpperCase();

  return (
    <div style={{ position:'sticky', top:0, zIndex:50, background:'rgba(247,246,242,0.95)', backdropFilter:'blur(12px)', borderBottom:`1px solid ${c.border}` }}>
      <div style={{ maxWidth:1240, margin:'0 auto', padding:'12px 24px', display:'flex', alignItems:'center', gap:24, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <LogoV size={34} />
          <div>
            <div style={{ fontWeight:700, fontSize:16, lineHeight:1.2, color:c.text, letterSpacing:'-0.01em' }}>Valora</div>
            <div style={{ fontSize:11, color:c.textMuted, lineHeight:1.2, marginTop:1 }}>
              {propiedades.length} {propiedades.length===1?'propiedad':'propiedades'}
              {isAdmin && propiedades.filter(p=>p.favorita).length > 0 && ` · ${propiedades.filter(p=>p.favorita).length} favoritas`}
            </div>
          </div>
        </div>

        <nav style={{ display:'flex', gap:2, flex:1, flexWrap:'wrap' }}>
          {items.map(item => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button key={item.id} onClick={()=>setView(item.id)}
                style={{ border:'none', background:active?c.surface:'transparent', color:active?c.text:c.textMuted, padding:'8px 14px', borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', gap:7, fontSize:13, fontWeight:active?600:500, fontFamily:FONT, boxShadow:active?shadow.sm:'none', transition:'all 150ms' }}>
                <Icon size={15} />
                {item.label}
                {item.locked && <Lock size={10} style={{ color:c.accent }} />}
              </button>
            );
          })}
        </nav>

        {/* Ícono de ayuda — solo admins */}
        {isAdmin && (
          <button onClick={onAbrirGuia}
            title="Cómo funciona Valora"
            style={{ border:'none', background:'transparent', cursor:'pointer', color:c.textMuted, padding:6, borderRadius:8, display:'flex', alignItems:'center', transition:'color 150ms' }}
            onMouseEnter={e=>e.currentTarget.style.color=c.text}
            onMouseLeave={e=>e.currentTarget.style.color=c.textMuted}>
            <HelpCircle size={20} />
          </button>
        )}

        <div style={{ position:'relative' }}>
          <button onClick={()=>setShowUserMenu(s=>!s)}
            style={{ display:'flex', alignItems:'center', gap:9, background:c.surface, border:`1px solid ${c.borderStrong}`, padding:'5px 5px 5px 12px', borderRadius:20, cursor:'pointer', fontFamily:FONT, position:'relative' }}>
            <span style={{ fontSize:13, fontWeight:500, color:c.text }}>{currentUser.displayName?.split(' ')[0] || currentUser.email.split('@')[0]}</span>
            <div style={{ width:26, height:26, borderRadius:'50%', background:isAdmin?c.text:c.borderStrong, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600, fontSize:11 }}>{inicial}</div>
            {isAdmin && pendientes > 0 && (
              <div style={{ position:'absolute', top:-2, right:-2, width:16, height:16, borderRadius:'50%', background:c.accent, color:'white', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>{pendientes}</div>
            )}
          </button>

          {showUserMenu && (
            <>
              <div onClick={()=>setShowUserMenu(false)} style={{ position:'fixed', inset:0, zIndex:99 }} />
              <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, background:c.surface, border:`1px solid ${c.border}`, borderRadius:12, boxShadow:'0 12px 30px rgba(30,45,74,0.15)', padding:6, zIndex:100, minWidth:240 }}>
                <div style={{ padding:'10px 12px', borderBottom:`1px solid ${c.border}`, marginBottom:4 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{currentUser.displayName || 'Sin nombre'}</div>
                  <div style={{ fontSize:11, color:c.textMuted, marginTop:2 }}>{currentUser.email}</div>
                  <Badge bg={isAdmin?c.text:c.borderStrong} color="white" style={{ marginTop:6 }}>{isAdmin ? 'Admin' : 'Invitado'}</Badge>
                </div>
                {isAdmin && (
                  <button onClick={()=>{setShowUserMenu(false); onAbrirGestionUsuarios();}}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', width:'100%', background:'transparent', border:'none', borderRadius:8, cursor:'pointer', textAlign:'left', color:c.text, fontSize:13, fontFamily:FONT, justifyContent:'space-between' }}
                    onMouseEnter={e=>e.currentTarget.style.background=c.surfaceAlt}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <Settings size={14} style={{ color:c.textMuted }} />
                      Gestionar usuarios
                    </span>
                    {pendientes > 0 && <Badge bg={c.accent} color="white">{pendientes}</Badge>}
                  </button>
                )}
                {migracionDisponible && (
                  <button onClick={()=>{setShowUserMenu(false); onAbrirMigracion();}}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', width:'100%', background:c.amberSoft, border:'none', borderRadius:8, cursor:'pointer', textAlign:'left', color:c.amber, fontSize:13, fontFamily:FONT, fontWeight:600, marginBottom:4 }}>
                    <Clock size={14} /> Migrar datos al nuevo sistema
                  </button>
                )}
                <button onClick={()=>{setShowUserMenu(false); onLogout();}}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', width:'100%', background:'transparent', border:'none', borderRadius:8, cursor:'pointer', textAlign:'left', color:c.text, fontSize:13, fontFamily:FONT }}
                  onMouseEnter={e=>e.currentTarget.style.background=c.surfaceAlt}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <LogOut size={14} style={{ color:c.textMuted }} />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// MODAL GESTIÓN DE USUARIOS
// ============================================================

const GestionUsuariosModal = ({ usuarios, currentUser, onAprobar, onRechazar, onCambiarRol, onEliminar, onClose }) => {
  const pendientes = usuarios.filter(u => u.estado === 'pendiente');
  const aprobados = usuarios.filter(u => u.estado === 'aprobado');
  const esSuperAdmin = currentUser.email === SUPER_ADMIN_EMAIL;

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(20,16,28,0.5)', backdropFilter:'blur(4px)', zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'60px 20px', overflow:'auto' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:c.surface, borderRadius:16, padding:28, maxWidth:600, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', fontFamily:FONT }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
          <div>
            <h2 style={{ margin:0, fontSize:22, fontWeight:700, letterSpacing:'-0.01em' }}>Gestión de usuarios</h2>
            <p style={{ margin:'4px 0 0', fontSize:13, color:c.textMuted }}>Aprobá quién puede acceder y con qué rol</p>
          </div>
          <button onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', color:c.textMuted, padding:4 }}><X size={20} /></button>
        </div>

        {pendientes.length > 0 && (
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:12, fontWeight:600, color:c.accent, marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
              <Clock size={13} /> Pendientes de aprobación ({pendientes.length})
            </div>
            {pendientes.map(u => (
              <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:c.amberSoft, borderRadius:10, marginBottom:8, border:`1px solid ${c.amber}30` }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:c.amber, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600, fontSize:14 }}>{u.email[0].toUpperCase()}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:500 }}>{u.displayName || u.email.split('@')[0]}</div>
                  <div style={{ fontSize:11, color:c.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                </div>
                <Button variant="primary" size="sm" onClick={()=>onAprobar(u.id, 'invitado')}><Check size={13} /> Invitado</Button>
                <Button variant="secondary" size="sm" onClick={()=>onAprobar(u.id, 'admin')}><UserCheck size={13} /> Admin</Button>
                <button onClick={()=>onRechazar(u.id)} style={{ border:'none', background:'transparent', cursor:'pointer', color:c.red, padding:6 }}><X size={16} /></button>
              </div>
            ))}
          </div>
        )}

        <div>
          <div style={{ fontSize:12, fontWeight:600, color:c.textMuted, marginBottom:10 }}>Usuarios aprobados ({aprobados.length})</div>
          {aprobados.map(u => {
            const esCurrentUser = u.email === currentUser.email;
            const esSuperAdminUser = u.email === SUPER_ADMIN_EMAIL;
            return (
              <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:c.surfaceAlt, borderRadius:10, marginBottom:6 }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background:u.rol==='admin'?c.text:c.borderStrong, color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600, fontSize:13 }}>{(u.displayName || u.email)[0].toUpperCase()}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:500 }}>{u.displayName || u.email.split('@')[0]} {esCurrentUser && <span style={{ fontSize:11, color:c.textMuted }}>(vos)</span>} {esSuperAdminUser && <span style={{ fontSize:11, color:c.accent }}>· super admin</span>}</div>
                  <div style={{ fontSize:11, color:c.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                </div>
                <select value={u.rol} onChange={e=>onCambiarRol(u.id, e.target.value)}
                  disabled={esSuperAdminUser || esCurrentUser}
                  style={{ ...iS, width:120, padding:'6px 10px', fontSize:12, cursor:esSuperAdminUser?'not-allowed':'pointer', opacity:esSuperAdminUser?0.5:1 }}>
                  <option value="admin">Admin</option>
                  <option value="invitado">Invitado</option>
                </select>
                {!esSuperAdminUser && !esCurrentUser && esSuperAdmin && (
                  <button onClick={()=>onEliminar(u.id)} style={{ border:'none', background:'transparent', cursor:'pointer', color:c.red, padding:4 }}><Trash2 size={14} /></button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop:18, padding:12, background:c.surfaceAlt, borderRadius:10, fontSize:12, color:c.textMuted, lineHeight:1.6 }}>
          Los usuarios entran con Google. La primera vez quedan en "pendiente" hasta que los aprobás acá.
          <br /><strong>Admin:</strong> ve presupuesto, análisis de compra, notas privadas. <strong>Invitado:</strong> solo info pública.
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PROPCARD
// ============================================================

const PropCard = ({ prop, criterios, presupuesto, config, isAdmin, onClick }) => {
  const puntaje = calcularPuntaje(prop.puntajes, criterios);
  const cumple = cumpleExcluyentes(prop, config?.excluyentesActivos, config?.ambientesMinimos);
  const analisis = calcularAnalisis(prop, presupuesto, config);
  const colAna = colorAnalisis(analisis.estado);
  const m2pond = (prop.m2Cubiertos||0) + (prop.m2Descubiertos||0)*0.5;
  const hColor = isAdmin && analisis.estado !== 'sin-datos'
    ? (analisis.estado==='rojo'?'#F7C1C1':analisis.estado==='amber'?'#FAC775':'#C0DD97')
    : semaforoBg(puntaje);
  const eColor = prop.estado==='Visitada'?c.green : (prop.estado==='Oferta hecha'||prop.estado==='En negociación')?c.purple : prop.estado==='Descartada'?c.red : c.amber;

  return (
    <Card hoverable onClick={onClick} style={{ opacity:(prop.estado==='Descartada'||!cumple)?0.55:1 }}>
      <div style={{ height:140, background:hColor, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
        {prop.fotos?.[0]
          ? <img src={prop.fotos[0]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', position:'absolute', inset:0 }} />
          : <ImageIcon size={30} style={{ color:colorPuntaje(puntaje), opacity:0.35 }} />
        }
        <div style={{ position:'absolute', top:10, left:10, background:c.surface, padding:'4px 10px', borderRadius:14, fontSize:11, fontWeight:500, display:'flex', alignItems:'center', gap:5, boxShadow:shadow.sm }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:eColor }} />
          {prop.estado||'Sin estado'}
        </div>
        {isAdmin && prop.favorita && (
          <div style={{ position:'absolute', top:10, right:10, width:28, height:28, borderRadius:'50%', background:c.surface, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:shadow.sm }}>
            <Heart size={13} fill={c.accent} color={c.accent} />
          </div>
        )}
        <div style={{ position:'absolute', bottom:10, right:10, background:c.surface, padding:'5px 11px', borderRadius:8, fontSize:18, fontWeight:700, color:colorPuntaje(puntaje), boxShadow:shadow.sm }}>
          {puntaje}
        </div>
      </div>
      <div style={{ padding:'13px 15px 15px' }}>
        <div style={{ fontSize:15, fontWeight:600, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{prop.nombre||'Sin nombre'}</div>
        <div style={{ fontSize:12, color:c.textMuted, marginBottom:11 }}>
          {prop.zona||'Sin zona'} · {prop.tipo||'Sin tipo'}{prop.ambientes?` · ${prop.ambientes} amb`:''}{m2pond>0?` · ${fmtNum(m2pond,0)}m²`:''}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
          <div style={{ fontSize:17, fontWeight:600 }}>{fmtUSD(prop.precioPedido)}</div>
          {isAdmin && analisis.estado !== 'sin-datos' && (
            <div style={{ fontSize:11, color:colAna.fg, fontWeight:500, display:'flex', alignItems:'center', gap:3 }}>
              {analisis.estado==='verde' ? <Check size={11} /> : analisis.estado==='amber' ? <AlertCircle size={11} /> : <X size={11} />}
              {analisis.resultado>=0?'Sobra':'Faltan'} {fmtUSDk(Math.abs(analisis.resultado))}
            </div>
          )}
        </div>
        {!cumple && <div style={{ marginTop:8, fontSize:11, color:c.red, display:'flex', alignItems:'center', gap:4 }}><AlertCircle size={11} />No cumple excluyentes</div>}
        {(() => {
          const hist = prop.aviso?.historialViews || [];
          if (hist.length < 2) return null;
          const diffDias = Math.max(1, (new Date(hist[hist.length-1].fecha) - new Date(hist[0].fecha)) / (1000*60*60*24));
          const vxd = (hist[hist.length-1].views - hist[0].views) / diffDias;
          const emoji = vxd < 10 ? '🔴' : vxd <= 30 ? '🟡' : '🟢';
          const label = vxd < 10 ? 'Frío' : vxd <= 30 ? 'Normal' : 'Caliente';
          return (
            <div style={{ marginTop:6, fontSize:11, color:c.textMuted, display:'flex', alignItems:'center', gap:4 }}>
              {emoji} {label} · {vxd.toFixed(1)} views/día
            </div>
          );
        })()}
      </div>
    </Card>
  );
};

// ============================================================
// HERO + STATS
// ============================================================

const Hero = ({ eyebrow, titulo, subtitulo, action }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:20, marginBottom:18, flexWrap:'wrap' }}>
    <div>
      {eyebrow && <div style={{ fontSize:12, fontWeight:500, color:c.accent, marginBottom:6 }}>{eyebrow}</div>}
      <h1 style={{ margin:0, fontSize:30, fontWeight:700, letterSpacing:'-0.02em', lineHeight:1, color:c.text }}>{titulo}</h1>
      {subtitulo && <div style={{ fontSize:13, color:c.textMuted, marginTop:6 }}>{subtitulo}</div>}
    </div>
    {action}
  </div>
);

const StatsAdmin = ({ presupuesto, config, topProp }) => {
  const vProm = ((presupuesto.ventaMin||0)+(presupuesto.ventaMax||0))/2;
  const total = vProm + (presupuesto.ahorros||0) + (presupuesto.aportes||0);
  const margen = total - (presupuesto.objetivo||0);
  return (
    <div style={{ marginBottom:22 }}>
      <div style={{ fontSize:11, color:c.accent, marginBottom:8, display:'flex', alignItems:'center', gap:5, fontWeight:500 }}>
        <Lock size={11} /> Visible solo para admins
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:10 }}>
        <div style={{ background:c.surface, border:`1px solid ${c.border}`, borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:11, color:c.textMuted, marginBottom:5 }}>Disponible</div>
          <div style={{ fontSize:19, fontWeight:700 }}>{fmtUSDk(total)}</div>
          <div style={{ fontSize:11, color:c.textSubtle, marginTop:3 }}>venta + ahorros + aportes</div>
        </div>
        <div style={{ background:c.surface, border:`1px solid ${c.border}`, borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:11, color:c.textMuted, marginBottom:5 }}>Objetivo</div>
          <div style={{ fontSize:19, fontWeight:700 }}>{fmtUSDk(presupuesto.objetivo)}</div>
          <div style={{ fontSize:11, color:margen>=0?c.green:c.red, marginTop:3 }}>{margen>=0?'+':'−'} {fmtUSDk(Math.abs(margen))} de margen</div>
        </div>
        <div style={{ background:c.surface, border:`1px solid ${c.border}`, borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:11, color:c.textMuted, marginBottom:5 }}>Top score</div>
          <div style={{ fontSize:19, fontWeight:700, color:topProp?colorPuntaje(topProp._puntaje):c.text }}>{topProp ? `${topProp._puntaje}/100` : '—'}</div>
          <div style={{ fontSize:11, color:c.textSubtle, marginTop:3 }}>{topProp ? `${topProp.nombre} · ${topProp.zona}` : 'Sin propiedades aún'}</div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// LISTA VIEW
// ============================================================

const ListaView = ({ propiedades, criterios, presupuesto, config, isAdmin, filtros, setFiltros, onSelectProp, onNuevaProp }) => {
  const { uid } = useUser();
  const handleSelectProp = (id) => { trackEvent(uid, 'detalleAbierto'); onSelectProp(id); };
  const filtradas = useMemo(() => propiedades.filter(p => {
    if (filtros.zona && p.zona !== filtros.zona) return false;
    if (filtros.estado && p.estado !== filtros.estado) return false;
    if (filtros.busqueda) {
      const q = filtros.busqueda.toLowerCase();
      if (!(p.nombre||'').toLowerCase().includes(q) && !(p.zona||'').toLowerCase().includes(q) && !(p.direccion||'').toLowerCase().includes(q)) return false;
    }
    if (isAdmin && filtros.soloFavoritas && !p.favorita) return false;
    return true;
  }).sort((a,b) => calcularPuntaje(b.puntajes,criterios) - calcularPuntaje(a.puntajes,criterios)), [propiedades, criterios, filtros, isAdmin, config]);

  const zonas = useMemo(() => {
    const ct={}; propiedades.forEach(p => { if(p.zona) ct[p.zona]=(ct[p.zona]||0)+1; });
    return Object.entries(ct).sort((a,b) => b[1]-a[1]);
  }, [propiedades]);

  const topProp = useMemo(() => {
    const activas = propiedades.filter(p => p.estado !== 'Descartada' && cumpleExcluyentes(p, config?.excluyentesActivos, config?.ambientesMinimos)).map(p => ({...p, _puntaje:calcularPuntaje(p.puntajes,criterios)}));
    return activas.sort((a,b) => b._puntaje - a._puntaje)[0] || null;
  }, [propiedades, criterios, config]);

  const favs = isAdmin ? propiedades.filter(p=>p.favorita).length : 0;

  return (
    <div style={{ maxWidth:1240, margin:'0 auto', padding:'30px 24px 64px' }}>
      <Hero
        eyebrow={`${propiedades.length} ${propiedades.length===1?'propiedad':'propiedades'}${favs>0?` · ${favs} ${favs===1?'favorita':'favoritas'}`:''}`}
        titulo={propiedades.length===0 ? 'Empezá tu búsqueda' : 'Búsqueda activa'}
        subtitulo={`${filtradas.length} ${filtradas.length===1?'resultado':'resultados'}${propiedades.length!==filtradas.length?` de ${propiedades.length}`:''} · ordenadas por puntaje`}
        action={isAdmin && <Button variant="primary" onClick={onNuevaProp}><Plus size={16} /> Nueva propiedad</Button>}
      />

      {isAdmin && propiedades.length > 0 && <StatsAdmin presupuesto={presupuesto} config={config} topProp={topProp} />}

      <div style={{ marginBottom:24 }}>
        <div style={{ position:'relative', marginBottom:12 }}>
          <Search size={15} style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:c.textMuted }} />
          <input type="text" defaultValue={filtros.busqueda||''} onChange={e=>setFiltros(f=>({...f, busqueda:e.target.value}))} placeholder="Buscar por nombre, barrio o dirección..." style={{ ...iS, paddingLeft:38 }} />
        </div>
        {zonas.length > 0 && (
          <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:8 }}>
            <Chip active={!filtros.zona} onClick={()=>setFiltros(f=>({...f, zona:''}))}>Todas</Chip>
            {zonas.map(([z,n]) => <Chip key={z} active={filtros.zona===z} onClick={()=>setFiltros(f=>({...f, zona:f.zona===z?'':z}))}>{z} ({n})</Chip>)}
          </div>
        )}
        <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
          <Chip active={!filtros.estado} onClick={()=>setFiltros(f=>({...f, estado:''}))}>Cualquier estado</Chip>
          {ESTADOS.filter(e=>e!=='Descartada').map(e => <Chip key={e} active={filtros.estado===e} onClick={()=>setFiltros(f=>({...f, estado:f.estado===e?'':e}))}>{e}</Chip>)}
          {isAdmin && <Chip active={filtros.soloFavoritas} onClick={()=>setFiltros(f=>({...f, soloFavoritas:!f.soloFavoritas}))}><Heart size={10} fill={filtros.soloFavoritas?'white':'none'} /> Favoritas</Chip>}
        </div>
      </div>

      {filtradas.length === 0 ? (
        <Card style={{ textAlign:'center', padding:56, background:c.surfaceAlt }}>
          <div style={{ width:52, height:52, borderRadius:'50%', background:c.border, margin:'0 auto 14px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Home size={22} style={{ color:c.textMuted }} />
          </div>
          <h3 style={{ margin:'0 0 8px', fontSize:16, fontWeight:600 }}>
            {propiedades.length===0 ? 'Todavía no cargaste ninguna propiedad' : 'Sin resultados con esos filtros'}
          </h3>
          <p style={{ margin:'0 0 16px', color:c.textMuted, fontSize:14, lineHeight:1.6 }}>
            {propiedades.length===0
              ? (isAdmin
                  ? 'Cada vez que encontrés una propiedad que te interese en Zonaprop o Argenprop, la cargás acá y la evaluás. Valora la ordena automáticamente por puntaje.'
                  : 'Los admins todavía no cargaron propiedades.')
              : 'Probá quitar algún filtro.'}
          </p>
          {propiedades.length===0 && isAdmin && <Button variant="primary" onClick={onNuevaProp}><Plus size={15} /> Nueva propiedad</Button>}
        </Card>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:18 }}>
          {filtradas.map(prop => <PropCard key={prop.id} prop={prop} criterios={criterios} presupuesto={presupuesto} config={config} isAdmin={isAdmin} onClick={()=>handleSelectProp(prop.id)} />)}
        </div>
      )}
    </div>
  );
};

// Helper thumbnail reutilizable en cards
const FotoThumb = ({ fotos, size=96, radius=14, puntaje }) => {
  const url = fotos?.[0];
  return url ? (
    <div style={{ width:size, height:size, borderRadius:radius, overflow:'hidden', flexShrink:0 }}>
      <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
    </div>
  ) : (
    <div style={{ width:size, height:size, borderRadius:radius, background:semaforoBg(puntaje||0), display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <ImageIcon size={size*0.3} style={{ color:colorPuntaje(puntaje||0), opacity:0.4 }} />
    </div>
  );
};

// ============================================================
// SECCION COLAPSABLE
// ============================================================

const Section = ({ icon:Icon, title, locked, preview, badge, open, onToggle, children }) => (
  <div style={{ background:c.surface, border:`1px solid ${c.border}`, borderRadius:14, marginBottom:10, overflow:'hidden', boxShadow:shadow.sm }}>
    <div onClick={onToggle} style={{ padding:'16px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', userSelect:'none' }}>
      <div style={{ display:'flex', alignItems:'center', gap:11, flex:1, minWidth:0 }}>
        {Icon && <Icon size={17} style={{ color:c.textMuted, flexShrink:0 }} />}
        {locked && <Lock size={12} style={{ color:c.accent, flexShrink:0 }} />}
        <span style={{ fontSize:14, fontWeight:600 }}>{title}</span>
        {preview && !open && <span style={{ fontSize:12, color:c.textSubtle, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{preview}</span>}
        {badge}
      </div>
      {open ? <ChevronDown size={15} style={{ color:c.textMuted }} /> : <ChevronRight size={15} style={{ color:c.textMuted }} />}
    </div>
    {open && <div style={{ padding:'4px 18px 18px', borderTop:`1px solid ${c.border}` }}><div style={{ paddingTop:14 }}>{children}</div></div>}
  </div>
);


// ============================================================
// SEMÁFORO DE DEMANDA
// ============================================================

const SemaforoDemanda = ({ prop, update }) => {
  const historial = prop.aviso?.historialViews || [];
  const [nuevaFecha, setNuevaFecha] = React.useState('');
  const [nuevasViews, setNuevasViews] = React.useState('');

  const agregarRegistro = () => {
    if (!nuevaFecha || !nuevasViews) return;
    const nuevo = { fecha: nuevaFecha, views: parseInt(nuevasViews) };
    const ordenado = [...historial, nuevo].sort((a,b) => a.fecha.localeCompare(b.fecha));
    update('aviso.historialViews', ordenado);
    setNuevaFecha('');
    setNuevasViews('');
  };

  const eliminarRegistro = (i) => {
    update('aviso.historialViews', historial.filter((_,idx) => idx !== i));
  };

  // Calcular semáforo
  let semaforo = null;
  if (historial.length >= 2) {
    const primero = historial[0];
    const ultimo = historial[historial.length - 1];
    const diffDias = Math.max(1, (new Date(ultimo.fecha) - new Date(primero.fecha)) / (1000*60*60*24));
    const viewsXDia = (ultimo.views - primero.views) / diffDias;
    if (viewsXDia < 10) semaforo = { color: c.red, bg: c.redSoft, emoji: '🔴', label: 'Frío', desc: 'Pocas visitas. El aviso puede llevar tiempo o no estar bien posicionado.', valor: viewsXDia };
    else if (viewsXDia <= 30) semaforo = { color: c.amber, bg: c.amberSoft, emoji: '🟡', label: 'Normal', desc: 'Flujo habitual. Demanda promedio para la zona y tipo.', valor: viewsXDia };
    else semaforo = { color: c.green, bg: c.greenSoft, emoji: '🟢', label: 'Caliente', desc: 'Mucho interés. Probable que se venda rápido o que el precio se mantenga firme.', valor: viewsXDia };
  }

  // Días en el mercado
  const diasMercado = prop.fechaPublicacion
    ? Math.floor((new Date() - new Date(prop.fechaPublicacion)) / (1000*60*60*24))
    : null;

  return (
    <div>
      {diasMercado != null && (
        <div style={{ marginBottom:12, fontSize:12, color:c.textMuted }}>
          En el mercado hace <strong style={{ color:c.text }}>{diasMercado} días</strong>
        </div>
      )}

      {semaforo && (
        <div style={{ marginBottom:14, padding:14, background:semaforo.bg, borderRadius:12, border:`1px solid ${semaforo.color}30` }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:16 }}>{semaforo.emoji}</span>
            <span style={{ fontWeight:600, fontSize:14, color:semaforo.color }}>{semaforo.label} · {semaforo.valor.toFixed(1)} views/día</span>
          </div>
          <div style={{ fontSize:12, color:semaforo.color, opacity:0.85 }}>{semaforo.desc}</div>
        </div>
      )}
      {historial.length === 1 && (
        <div style={{ marginBottom:14, fontSize:12, color:c.textMuted, padding:10, background:c.surfaceAlt, borderRadius:8 }}>
          Cargá un segundo registro para ver la tendencia de demanda.
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:c.textMuted, marginBottom:8 }}>Historial de views</div>
          {historial.map((r, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:`1px solid ${c.border}` }}>
              <span style={{ fontSize:12, color:c.textMuted, minWidth:90 }}>{r.fecha}</span>
              <span style={{ fontSize:13, fontWeight:500 }}>{r.views.toLocaleString('es-AR')} views</span>
              <button onClick={()=>eliminarRegistro(i)} style={{ border:'none', background:'transparent', cursor:'pointer', color:c.red, padding:2, marginLeft:'auto' }}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Agregar registro */}
      <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
        <Field label="Fecha" style={{ flex:1, marginBottom:0 }}>
          <input type="date" value={nuevaFecha} onChange={e=>setNuevaFecha(e.target.value)} style={{ ...iS }} />
        </Field>
        <Field label="Views" style={{ flex:1, marginBottom:0 }}>
          <input type="number" value={nuevasViews} onChange={e=>setNuevasViews(e.target.value)} placeholder="Ej: 340" style={{ ...iS }} />
        </Field>
        <Button variant="secondary" size="sm" onClick={agregarRegistro} style={{ marginBottom:14 }}><Plus size={13} /> Agregar</Button>
      </div>
    </div>
  );
};

// ============================================================
// FOTOS — upload, galería y lightbox
// ============================================================

const MAX_FOTOS = 10;
const MAX_W = 1600;
const QUALITY = 0.85;

const comprimirImagen = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const scale = img.width > MAX_W ? MAX_W / img.width : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compresión fallida')), 'image/jpeg', QUALITY);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
  img.src = url;
});

const Lightbox = ({ fotos, index, onClose, onPrev, onNext }) => {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <button onClick={(e)=>{e.stopPropagation();onPrev();}} style={{ position:'absolute', left:16, background:'rgba(255,255,255,0.12)', border:'none', borderRadius:'50%', width:44, height:44, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'white' }}>
        <ChevronDown size={22} style={{ transform:'rotate(90deg)' }} />
      </button>
      <img onClick={e=>e.stopPropagation()} src={fotos[index]} alt="" style={{ maxWidth:'90vw', maxHeight:'88vh', borderRadius:10, objectFit:'contain', boxShadow:'0 8px 40px rgba(0,0,0,0.6)' }} />
      <button onClick={(e)=>{e.stopPropagation();onNext();}} style={{ position:'absolute', right:16, background:'rgba(255,255,255,0.12)', border:'none', borderRadius:'50%', width:44, height:44, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'white' }}>
        <ChevronDown size={22} style={{ transform:'rotate(-90deg)' }} />
      </button>
      <button onClick={onClose} style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,0.12)', border:'none', borderRadius:'50%', width:36, height:36, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'white' }}>
        <X size={18} />
      </button>
      <div style={{ position:'absolute', bottom:18, left:'50%', transform:'translateX(-50%)', display:'flex', gap:7 }}>
        {fotos.map((_,i) => (
          <div key={i} style={{ width:i===index?20:8, height:8, borderRadius:4, background:i===index?'white':'rgba(255,255,255,0.4)', transition:'all 200ms' }} />
        ))}
      </div>
    </div>
  );
};

const GaleriaFotos = ({ prop, propId, userId, update, isAdmin }) => {
  const { uid } = useUser();
  const fotos = prop.fotos || [];
  const [subiendo, setSubiendo] = useState({});
  const [errores, setErrores] = useState({});
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const fileRef = React.useRef();

  const abrirLightbox = (i) => setLightboxIdx(i);
  const cerrarLightbox = () => setLightboxIdx(null);
  const prevFoto = () => setLightboxIdx(i => (i - 1 + fotos.length) % fotos.length);
  const nextFoto = () => setLightboxIdx(i => (i + 1) % fotos.length);

  const subirFotos = async (files) => {
    const disponibles = MAX_FOTOS - fotos.length;
    const seleccionadas = Array.from(files).slice(0, disponibles);
    if (seleccionadas.length === 0) return;
    for (const file of seleccionadas) {
      const tempId = `${Date.now()}-${Math.random()}`;
      setSubiendo(p => ({ ...p, [tempId]: 0 }));
      setErrores(p => { const n = {...p}; delete n[tempId]; return n; });
      try {
        const blob = await comprimirImagen(file);
        const storageRef = ref(storage, `properties/${userId}/${propId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g,'_')}`);
        const task = uploadBytesResumable(storageRef, blob, { contentType: 'image/jpeg' });
        await new Promise((resolve, reject) => {
          task.on('state_changed',
            snap => setSubiendo(p => ({ ...p, [tempId]: Math.round(snap.bytesTransferred / snap.totalBytes * 100) })),
            err => { setErrores(p => ({ ...p, [tempId]: 'Error al subir' })); reject(err); },
            async () => {
              const url = await getDownloadURL(task.snapshot.ref);
              update('fotos', [...(prop.fotos || []), url]);
              setSubiendo(p => { const n = {...p}; delete n[tempId]; return n; });
              trackEvent(uid, 'fotosSubidas');
              resolve();
            }
          );
        });
      } catch {
        setErrores(p => ({ ...p, [tempId]: 'Error al subir, intentá de nuevo' }));
        setSubiendo(p => { const n = {...p}; delete n[tempId]; return n; });
      }
    }
  };

  const eliminarFoto = async (i) => {
    const url = fotos[i];
    update('fotos', fotos.filter((_,idx) => idx !== i));
    try { await deleteObject(ref(storage, url)); } catch { /* ignore */ }
  };

  const hacerPrincipal = (i) => {
    if (i === 0) return;
    update('fotos', [fotos[i], ...fotos.filter((_,idx) => idx !== i)]);
  };

  const haySubidas = Object.keys(subiendo).length > 0;
  const hayErrores = Object.keys(errores).length > 0;
  const puedeSubir = fotos.length < MAX_FOTOS && !haySubidas;

  return (
    <div>
      {fotos.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:8, marginBottom:12 }}>
          {fotos.map((url, i) => (
            <div key={url} style={{ position:'relative', borderRadius:10, overflow:'hidden', aspectRatio:'4/3', background:c.surfaceAlt }}>
              <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', cursor:'pointer' }} onClick={()=>abrirLightbox(i)} />
              {i === 0 && (
                <div style={{ position:'absolute', top:5, left:5, background:c.accent, color:'white', fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:5, pointerEvents:'none' }}>Principal</div>
              )}
              {isAdmin && (
                <div className="foto-overlay" style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', display:'flex', alignItems:'center', justifyContent:'center', gap:6, opacity:0, transition:'all 150ms' }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,0,0,0.48)';e.currentTarget.style.opacity='1';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,0,0,0)';e.currentTarget.style.opacity='0';}}>
                  {i !== 0 && (
                    <button onClick={(e)=>{e.stopPropagation();hacerPrincipal(i);}}
                      style={{ background:'white', border:'none', borderRadius:6, padding:'4px 8px', fontSize:11, fontWeight:600, cursor:'pointer', color:c.text }}>
                      Principal
                    </button>
                  )}
                  <button onClick={(e)=>{e.stopPropagation();eliminarFoto(i);}}
                    style={{ background:c.red, border:'none', borderRadius:'50%', width:28, height:28, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'white' }}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {haySubidas && (
        <div style={{ marginBottom:10 }}>
          {Object.entries(subiendo).map(([id, pct]) => (
            <div key={id} style={{ marginBottom:7 }}>
              <div style={{ fontSize:12, color:c.textMuted, marginBottom:4 }}>Subiendo... {pct}%</div>
              <div style={{ height:5, background:c.border, borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${pct}%`, background:c.accent, borderRadius:3, transition:'width 200ms' }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {hayErrores && Object.values(errores).map((err, i) => (
        <div key={i} style={{ fontSize:12, color:c.red, padding:'6px 10px', background:c.redSoft, borderRadius:7, marginBottom:8 }}>⚠️ {err}</div>
      ))}
      {isAdmin && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:'none' }}
            onChange={e=>{ subirFotos(e.target.files); e.target.value=''; }} />
          <button onClick={()=>fileRef.current?.click()} disabled={!puedeSubir}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 14px', background:puedeSubir?c.surfaceAlt:'transparent', border:`1.5px dashed ${puedeSubir?c.border:'#ccc'}`, borderRadius:10, cursor:puedeSubir?'pointer':'not-allowed', fontSize:13, color:puedeSubir?c.text:c.textMuted, fontWeight:500 }}>
            <Plus size={15} />
            {fotos.length === 0 ? 'Agregar fotos' : fotos.length >= MAX_FOTOS ? `Máximo ${MAX_FOTOS} fotos` : `Agregar fotos (${fotos.length}/${MAX_FOTOS})`}
          </button>
          {fotos.length > 0 && <div style={{ fontSize:11, color:c.textMuted, marginTop:6 }}>Hover para eliminar o hacer principal · Click para ampliar</div>}
        </div>
      )}
      {lightboxIdx !== null && (
        <Lightbox fotos={fotos} index={lightboxIdx} onClose={cerrarLightbox} onPrev={prevFoto} onNext={nextFoto} />
      )}
    </div>
  );
};

// ============================================================
// GOOGLE MAPS — loader, autocomplete, mapa y distancias
// ============================================================

let gmapsPromise = null;
const loadGoogleMaps = () => {
  if (window.google?.maps) return Promise.resolve();
  if (gmapsPromise) return gmapsPromise;
  gmapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(script);
  });
  return gmapsPromise;
};

// Input con autocomplete de Google Places — solo CABA/Argentina
const DireccionAutocomplete = ({ value, onSelect, placeholder = 'Av. Cabildo 2500, CABA', disabled }) => {
  const inputRef = useRef(null);
  const acRef = useRef(null);
  const [inputVal, setInputVal] = useState(value || '');
  const [gmReady, setGmReady] = useState(!!window.google?.maps);

  useEffect(() => { setInputVal(value || ''); }, [value]);

  useEffect(() => {
    loadGoogleMaps().then(() => setGmReady(true)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!gmReady || !inputRef.current || acRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'ar' },
      fields: ['formatted_address', 'geometry'],
      types: ['address'],
    });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place.geometry) return;
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setInputVal(place.formatted_address);
      onSelect({ direccion: place.formatted_address, lat, lng });
    });
    acRef.current = ac;
  }, [gmReady]);

  return (
    <input
      ref={inputRef}
      value={inputVal}
      onChange={e => setInputVal(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: '100%', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${c.border}`,
        fontSize: 13, fontFamily: 'inherit', background: c.surface, color: c.text,
        outline: 'none', boxSizing: 'border-box'
      }}
      onFocus={e => e.target.style.borderColor = c.accent}
      onBlur={e => e.target.style.borderColor = c.border}
    />
  );
};

const COLORES_LUGARES = ['#4285F4','#EA4335','#34A853','#FBBC05','#9C27B0'];

const MapaDistancias = ({ prop, lugaresRef, update, isAdmin }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [gmReady, setGmReady] = useState(!!window.google?.maps);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadGoogleMaps().then(() => setGmReady(true)).catch(e => setError(e.message));
  }, []);

  const lugaresConCoords = lugaresRef.filter(l => l.lat && l.lng && l.nombre);
  const propTieneCoords = prop.lat && prop.lng;
  const distancias = prop.distancias || {};
  const lugaresHash = lugaresConCoords.map(l => `${l.nombre}|${l.lat}|${l.lng}`).join(';;');
  const distHashGuardado = prop.distanciasHash || '';

  // Calcular distancias y rutas si no están o si cambiaron los lugares
  useEffect(() => {
    if (!gmReady || !propTieneCoords || lugaresConCoords.length === 0) return;
    if (distHashGuardado === lugaresHash && Object.keys(distancias).length > 0) return;

    const calcular = async () => {
      setCalculando(true);
      setError(null);
      try {
        const dm = new window.google.maps.DistanceMatrixService();
        const origin = new window.google.maps.LatLng(prop.lat, prop.lng);
        const destinations = lugaresConCoords.map(l => new window.google.maps.LatLng(l.lat, l.lng));

        dm.getDistanceMatrix({
          origins: [origin],
          destinations,
          travelMode: window.google.maps.TravelMode.DRIVING,
          unitSystem: window.google.maps.UnitSystem.METRIC,
        }, (resp, status) => {
          if (status !== 'OK') { setError('Error al calcular distancias'); setCalculando(false); return; }
          const row = resp.rows[0].elements;
          const nuevas = {};
          lugaresConCoords.forEach((l, i) => {
            if (row[i].status === 'OK') {
              nuevas[`${l.nombre}|${l.lat}|${l.lng}`] = {
                nombre: l.nombre,
                tiempoMin: Math.round(row[i].duration.value / 60),
                distanciaKm: (row[i].distance.value / 1000).toFixed(1),
                tiempoTexto: row[i].duration.text,
                distanciaTexto: row[i].distance.text,
              };
            }
          });
          update('distancias', nuevas);
          update('distanciasHash', lugaresHash);
          setCalculando(false);
        });
      } catch (e) {
        setError('Error al calcular distancias');
        setCalculando(false);
      }
    };
    calcular();
  }, [gmReady, propTieneCoords, lugaresHash]);

  // Inicializar mapa
  useEffect(() => {
    if (!gmReady || !propTieneCoords || !mapRef.current) return;

    const center = { lat: prop.lat, lng: prop.lng };
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
    });
    mapInstanceRef.current = map;

    // Marker de la propiedad
    const propMarker = new window.google.maps.Marker({
      position: center,
      map,
      title: prop.nombre || 'Propiedad',
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#E53935',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
      },
      zIndex: 10,
    });

    // InfoWindow de la propiedad con foto
    const fotoPrincipal = prop.fotos?.[0];
    const iwContent = `
      <div style="max-width:200px;font-family:sans-serif">
        ${fotoPrincipal ? `<img src="${fotoPrincipal}" style="width:100%;height:110px;object-fit:cover;border-radius:6px;margin-bottom:8px" />` : ''}
        <div style="font-weight:600;font-size:13px;margin-bottom:3px">${prop.nombre || 'Propiedad'}</div>
        <div style="font-size:11px;color:#666">${prop.zona || ''} · ${prop.tipo || ''}</div>
        ${prop.precioPedido ? `<div style="font-size:12px;font-weight:600;color:#E53935;margin-top:4px">USD ${prop.precioPedido.toLocaleString()}</div>` : ''}
      </div>
    `;
    const infoWindowProp = new window.google.maps.InfoWindow({ content: iwContent });
    propMarker.addListener('click', () => infoWindowProp.open(map, propMarker));

    // Bounds para hacer zoom automático
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend(center);

    // Markers de lugares de referencia + rutas
    const directionsService = new window.google.maps.DirectionsService();

    lugaresConCoords.forEach((lugar, i) => {
      const color = COLORES_LUGARES[i % COLORES_LUGARES.length];
      const lugarPos = { lat: lugar.lat, lng: lugar.lng };
      bounds.extend(lugarPos);

      // Marker del lugar
      const marker = new window.google.maps.Marker({
        position: lugarPos,
        map,
        title: lugar.nombre,
        label: {
          text: (i + 1).toString(),
          color: 'white',
          fontWeight: 'bold',
          fontSize: '12px',
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
      });

      // Distancia en infowindow del lugar
      const key = `${lugar.nombre}|${lugar.lat}|${lugar.lng}`;
      const dist = distancias[key];
      const distInfo = dist
        ? `<div style="font-size:12px;margin-top:6px">🚗 <b>${dist.tiempoTexto}</b> · ${dist.distanciaTexto}</div>`
        : `<div style="font-size:11px;color:#999;margin-top:4px">Calculando...</div>`;

      const iwLugar = new window.google.maps.InfoWindow({
        content: `<div style="font-family:sans-serif"><div style="font-weight:600;font-size:13px">${lugar.nombre}</div><div style="font-size:11px;color:#666">${lugar.direccion}</div>${distInfo}</div>`
      });
      marker.addListener('click', () => iwLugar.open(map, marker));

      // Ruta real en auto
      directionsService.route({
        origin: center,
        destination: lugarPos,
        travelMode: window.google.maps.TravelMode.DRIVING,
      }, (result, status) => {
        if (status === 'OK') {
          new window.google.maps.DirectionsRenderer({
            map,
            directions: result,
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: color,
              strokeOpacity: 0.7,
              strokeWeight: 4,
            },
          });
        }
      });
    });

    if (lugaresConCoords.length > 0) {
      map.fitBounds(bounds, { padding: 50 });
    }

    return () => { mapInstanceRef.current = null; };
  }, [gmReady, prop.lat, prop.lng, lugaresConCoords.length, JSON.stringify(distancias)]);

  // Estado: sin dirección
  if (!propTieneCoords) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 20px', background: c.surfaceAlt, borderRadius: 10, color: c.textMuted }}>
        <MapPin size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Sin dirección cargada</div>
        <div style={{ fontSize: 12 }}>Completá la dirección en Identificación para ver el mapa.</div>
      </div>
    );
  }

  // Estado: sin lugares de referencia
  if (lugaresConCoords.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 20px', background: c.surfaceAlt, borderRadius: 10, color: c.textMuted }}>
        <Navigation size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Sin lugares de referencia</div>
        <div style={{ fontSize: 12 }}>Agregá lugares en Configuración para ver distancias.</div>
      </div>
    );
  }

  return (
    <div>
      {/* Mapa */}
      {error && (
        <div style={{ fontSize: 12, color: c.red, padding: '8px 12px', background: c.redSoft, borderRadius: 8, marginBottom: 10 }}>
          ⚠️ {error}
        </div>
      )}
      <div ref={mapRef} style={{ width: '100%', height: 340, borderRadius: 10, overflow: 'hidden', marginBottom: 14, background: c.surfaceAlt }} />

      {/* Tabla de distancias */}
      {calculando ? (
        <div style={{ fontSize: 12, color: c.textMuted, textAlign: 'center', padding: '10px 0' }}>Calculando distancias...</div>
      ) : (
        <div>
          {lugaresConCoords.map((lugar, i) => {
            const key = `${lugar.nombre}|${lugar.lat}|${lugar.lng}`;
            const dist = distancias[key];
            const color = COLORES_LUGARES[i % COLORES_LUGARES.length];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: c.surfaceAlt, borderRadius: 8, marginBottom: 7 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: color, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{lugar.nombre}</div>
                  <div style={{ fontSize: 11, color: c.textMuted }}>{lugar.direccion}</div>
                </div>
                {dist ? (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>🚗 {dist.tiempoTexto}</div>
                    <div style={{ fontSize: 11, color: c.textMuted }}>{dist.distanciaTexto}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: c.textMuted }}>—</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============================================================
// HISTORIAL DE PRECIO
// ============================================================

const HistorialPrecio = ({ prop, update }) => {
  const historial = prop.aviso?.historialPrecio || [];
  const [nuevaFecha, setNuevaFecha] = React.useState('');
  const [nuevoPrecio, setNuevoPrecio] = React.useState('');

  const agregarRegistro = () => {
    if (!nuevaFecha || !nuevoPrecio) return;
    const nuevo = { fecha: nuevaFecha, precio: parseInt(nuevoPrecio) };
    const ordenado = [...historial, nuevo].sort((a,b) => a.fecha.localeCompare(b.fecha));
    update('aviso.historialPrecio', ordenado);
    setNuevaFecha('');
    setNuevoPrecio('');
  };

  const eliminarRegistro = (i) => {
    update('aviso.historialPrecio', historial.filter((_,idx) => idx !== i));
  };

  // Detectar si bajó el precio
  let bajada = null;
  if (historial.length >= 2) {
    const primero = historial[0];
    const ultimo = historial[historial.length - 1];
    const diff = ultimo.precio - primero.precio;
    const pct = primero.precio > 0 ? (diff / primero.precio * 100).toFixed(1) : 0;
    if (diff < 0) bajada = { diff: Math.abs(diff), pct: Math.abs(pct) };
  }

  return (
    <div style={{ marginTop:20, paddingTop:16, borderTop:`1px solid ${c.border}` }}>
      <div style={{ fontSize:12, fontWeight:600, color:c.textMuted, marginBottom:10 }}>Historial de precio</div>

      {bajada && (
        <div style={{ marginBottom:12, padding:'10px 14px', background:c.greenSoft, borderRadius:10, fontSize:13, color:c.green, fontWeight:500 }}>
          📉 Bajó {fmtUSD(bajada.diff)} ({bajada.pct}%) desde la publicación
        </div>
      )}

      {historial.length > 0 && (
        <div style={{ marginBottom:12 }}>
          {historial.map((r, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0', borderBottom:`1px solid ${c.border}` }}>
              <span style={{ fontSize:12, color:c.textMuted, minWidth:90 }}>{r.fecha}</span>
              <span style={{ fontSize:13, fontWeight:500 }}>{fmtUSD(r.precio)}</span>
              {i > 0 && historial[i-1] && (
                <span style={{ fontSize:11, color: r.precio < historial[i-1].precio ? c.green : r.precio > historial[i-1].precio ? c.red : c.textSubtle }}>
                  {r.precio < historial[i-1].precio ? '↓' : r.precio > historial[i-1].precio ? '↑' : '='} {fmtUSD(Math.abs(r.precio - historial[i-1].precio))}
                </span>
              )}
              <button onClick={()=>eliminarRegistro(i)} style={{ border:'none', background:'transparent', cursor:'pointer', color:c.red, padding:2, marginLeft:'auto' }}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
        <Field label="Fecha" style={{ flex:1, marginBottom:0 }}>
          <input type="date" value={nuevaFecha} onChange={e=>setNuevaFecha(e.target.value)} style={{ ...iS }} />
        </Field>
        <Field label="Precio (USD)" style={{ flex:1, marginBottom:0 }}>
          <input type="number" value={nuevoPrecio} onChange={e=>setNuevoPrecio(e.target.value)} placeholder="Ej: 285000" style={{ ...iS }} />
        </Field>
        <Button variant="secondary" size="sm" onClick={agregarRegistro} style={{ marginBottom:14 }}><Plus size={13} /> Agregar</Button>
      </div>
    </div>
  );
};

// ============================================================
// DETALLE VIEW
// ============================================================

const DetalleView = ({ prop, setProp, criterios, presupuesto, config, isAdmin, userId, onBack, onDelete }) => {
  const [sec, setSec] = useState({ ident:true, fotos:true, fisicos:false, financieros:true, excluyentes:false, puntajes:true, comodidades:false, caracteristicas:false, aviso:false, mapa:true, proceso:false, negociacion:false, visita:false, notas:false });
  const toggle = k => setSec(s => ({ ...s, [k]: !s[k] }));
  const update = (path, value) => {
    setProp(prev => {
      const keys = path.split('.');
      const np = { ...prev };
      let cur = np;
      for (let i = 0; i < keys.length-1; i++) { cur[keys[i]] = { ...cur[keys[i]] }; cur = cur[keys[i]]; }
      cur[keys[keys.length-1]] = value;
      return np;
    });
  };

  const puntaje = calcularPuntaje(prop.puntajes, criterios);
  const analisis = calcularAnalisis(prop, presupuesto, config);
  const colAna = colorAnalisis(analisis.estado);
  const m2pond = (prop.m2Cubiertos||0) + (prop.m2Descubiertos||0)*0.5;
  const usdM2 = m2pond>0 && prop.precioPedido ? prop.precioPedido/m2pond : null;
  const excluyentesActivos = EXCLUYENTES_DISPONIBLES.filter(e => (config?.excluyentesActivos || EXCLUYENTES_DEFAULT).includes(e.id) && e.id !== 'cochera');
  const exCumple = excluyentesActivos.filter(e => prop.excluyentes?.[e.id]).length;
  const heroColor = isAdmin && analisis.estado!=='sin-datos'
    ? (analisis.estado==='rojo'?'#F7C1C1':analisis.estado==='amber'?'#FAC775':'#C0DD97')
    : semaforoBg(puntaje);


  return (
    <div style={{ maxWidth:880, margin:'0 auto', padding:'24px 24px 64px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <Button variant="ghost" onClick={onBack}><ArrowLeft size={15} /> Volver</Button>
        {isAdmin && (
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="secondary" size="sm" onClick={()=>update('favorita', !prop.favorita)}>
              <Heart size={13} fill={prop.favorita?c.accent:'none'} color={prop.favorita?c.accent:c.text} />
              {prop.favorita ? 'Favorita' : 'Marcar favorita'}
            </Button>
            {prop.estado !== 'Descartada'
              ? <Button variant="secondary" size="sm" onClick={()=>{ update('estado','Descartada'); onBack(); }}><X size={13} /> Descartar</Button>
              : <Button variant="secondary" size="sm" onClick={()=>{ update('estado','Para visitar'); onBack(); }}>Recuperar</Button>
            }
            <Button variant="danger" size="sm" onClick={onDelete}><Trash2 size={13} /></Button>
          </div>
        )}
      </div>

      <Card style={{ marginBottom:14, padding:22 }}>
        <div style={{ display:'flex', gap:18, alignItems:'flex-start' }}>
          <FotoThumb fotos={prop.fotos} size={96} radius={14} puntaje={puntaje} />
          <div style={{ flex:1, minWidth:0 }}>
            <TextInput defaultValue={prop.nombre} onCommit={v=>update('nombre',v)} placeholder="Nombre de la propiedad"
              style={{ fontSize:22, fontWeight:700, border:'none', padding:'0 0 5px', letterSpacing:'-0.01em' }} />
            <div style={{ fontSize:13, color:c.textMuted, marginBottom:10 }}>
              {prop.zona||'Sin zona'} · {prop.tipo||'Sin tipo'}{prop.ambientes?` · ${prop.ambientes} amb`:''}{m2pond>0?` · ${fmtNum(m2pond,0)}m²`:''}
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <Badge bg={c.surfaceAlt} color={c.text} style={{ border:`1px solid ${c.border}` }}>{prop.estado||'Para visitar'}</Badge>
              {prop.inmobiliaria && <Badge bg={c.surfaceAlt} color={c.text} style={{ border:`1px solid ${c.border}` }}>{prop.inmobiliaria}</Badge>}
            </div>
          </div>
          <div style={{ textAlign:'center', flexShrink:0 }}>
            <div style={{ fontSize:38, fontWeight:700, color:colorPuntaje(puntaje), lineHeight:1, letterSpacing:'-0.02em' }}>{puntaje}</div>
            <div style={{ fontSize:11, color:c.textSubtle, marginTop:4 }}>de 100</div>
          </div>
        </div>
      </Card>

      <div style={{ display:'grid', gridTemplateColumns:isAdmin?'1fr 1fr':'1fr', gap:10, marginBottom:14 }}>
        <Card style={{ padding:16 }}>
          <div style={{ fontSize:11, color:c.textMuted, marginBottom:6 }}>Precio pedido</div>
          <div style={{ fontSize:22, fontWeight:700 }}>{fmtUSD(prop.precioPedido)}</div>
          {usdM2 && <div style={{ fontSize:12, color:c.textMuted, marginTop:5 }}>{fmtUSD(usdM2)}/m² ponderado</div>}
        </Card>
        {isAdmin && (
          <Card style={{ padding:16, background:colAna.bg, border:`1px solid ${colAna.fg}30` }}>
            <div style={{ fontSize:11, color:colAna.fg, marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>
              <Lock size={10} /> Análisis de compra
            </div>
            {analisis.estado === 'sin-datos' ? (
              <div style={{ fontSize:14, color:colAna.fg }}>Cargá el precio pedido</div>
            ) : (
              <>
                <div style={{ fontSize:22, fontWeight:700, color:colAna.fg }}>{analisis.resultado>=0?'+':'−'} {fmtUSDk(Math.abs(analisis.resultado))}</div>
                <div style={{ fontSize:12, color:colAna.fg, marginTop:5, opacity:0.85 }}>{colAna.label} · Costo {fmtUSD(analisis.costoTotal)}</div>
              </>
            )}
          </Card>
        )}
      </div>

      {/* IDENTIFICACIÓN */}
      <Section icon={Info} title="Identificación" open={sec.ident} onToggle={()=>toggle('ident')}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 }}>
          <Field label="Dirección">
            <DireccionAutocomplete
              value={prop.direccion}
              placeholder="Calle 1234, CABA"
              onSelect={({ direccion, lat, lng }) => {
                update('direccion', direccion);
                update('lat', lat);
                update('lng', lng);
                // resetear distancias para que se recalculen
                update('distanciasHash', '');
              }}
            />
          </Field>
          <Field label="Zona / Barrio"><Select value={prop.zona} onChange={v=>update('zona',v)} options={ZONAS} /></Field>
          <Field label="Tipo de propiedad"><Select value={prop.tipo} onChange={v=>update('tipo',v)} options={TIPOS} /></Field>
          <Field label="Subtipo"><Select value={prop.subtipo} onChange={v=>update('subtipo',v)} options={SUBTIPOS} /></Field>
          <Field label="Disposición"><Select value={prop.disposicion} onChange={v=>update('disposicion',v)} options={DISPOSICIONES} /></Field>
          <Field label="Tipo de anunciante"><Select value={prop.anunciante} onChange={v=>update('anunciante',v)} options={ANUNCIANTES} /></Field>
          <Field label="Link al aviso"><TextInput defaultValue={prop.linkAviso} onCommit={v=>update('linkAviso',v)} placeholder="https://..." /></Field>
          <Field label="Inmobiliaria"><TextInput defaultValue={prop.inmobiliaria} onCommit={v=>update('inmobiliaria',v)} /></Field>
          <Field label="Agente"><TextInput defaultValue={prop.agente} onCommit={v=>update('agente',v)} placeholder="Nombre" /></Field>
          <Field label="Teléfono del agente"><TextInput defaultValue={prop.telefonoAgente} onCommit={v=>update('telefonoAgente',v)} placeholder="+54 11 ..." /></Field>
        </div>
      </Section>

      {/* FOTOS */}
      <Section icon={ImageIcon} title="Fotos" badge={prop.fotos?.length > 0 ? <Badge bg={c.surfaceAlt} color={c.textMuted}>{prop.fotos.length}/{MAX_FOTOS}</Badge> : null} open={sec.fotos} onToggle={()=>toggle('fotos')}>
        <GaleriaFotos prop={prop} propId={prop.id} userId={userId} update={update} isAdmin={isAdmin} />
      </Section>

      {/* COMODIDADES */}
      <Section icon={Star} title="Comodidades" open={sec.comodidades} onToggle={()=>toggle('comodidades')}>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, fontWeight:600, color:c.textMuted, marginBottom:10 }}>De la propiedad</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {[
              {id:'balcon',label:'Balcón'},{id:'terraza',label:'Terraza'},{id:'patio',label:'Patio'},
              {id:'jardin',label:'Jardín'},{id:'pileta',label:'Pileta'},{id:'quincho',label:'Quincho'},
              {id:'solarium',label:'Solarium'},{id:'lavadero',label:'Lavadero'},{id:'toilette',label:'Toilette'},
              {id:'banoSuite',label:'Baño en suite'},{id:'vestidor',label:'Vestidor'},
              {id:'dependencia',label:'Dep. de servicio'},{id:'baulera',label:'Baulera'},{id:'parrilla',label:'Parrilla'},
            ].map(item => <Toggle key={item.id} checked={prop.comodidades?.[item.id]===true} onChange={v=>update(`comodidades.${item.id}`,v)} label={item.label} />)}
          </div>
        </div>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:c.textMuted, marginBottom:10, paddingTop:10, borderTop:`1px solid ${c.border}` }}>Del edificio</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {[
              {id:'sum',label:'SUM'},{id:'gimnasio',label:'Gimnasio'},{id:'ascensor',label:'Ascensor'},
              {id:'encargado',label:'Encargado'},{id:'vigilancia',label:'Vigilancia'},{id:'laundry',label:'Laundry'},
            ].map(item => <Toggle key={item.id} checked={prop.comodidades?.[item.id]===true} onChange={v=>update(`comodidades.${item.id}`,v)} label={item.label} />)}
          </div>
        </div>
      </Section>

      {/* CARACTERÍSTICAS */}
      <Section icon={ListChecks} title="Características" open={sec.caracteristicas} onToggle={()=>toggle('caracteristicas')}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {[
            {id:'aptoCredito',label:'Apto crédito'},{id:'aptoProfesional',label:'Apto profesional'},
            {id:'permiteMascotas',label:'Permite mascotas'},{id:'luminoso',label:'Luminoso'},
            {id:'ofreceFinanciacion',label:'Ofrece financiación'},{id:'accesoMovilidad',label:'Acceso movilidad reducida'},
          ].map(item => <Toggle key={item.id} checked={prop.caracteristicas?.[item.id]===true} onChange={v=>update(`caracteristicas.${item.id}`,v)} label={item.label} />)}
        </div>
      </Section>

      {/* DATOS FÍSICOS */}
      <Section icon={Ruler} title="Datos físicos" preview={m2pond>0?`${fmtNum(m2pond,0)}m² · ${prop.ambientes||'?'} amb · ${prop.banos||'?'} baños`:null} open={sec.fisicos} onToggle={()=>toggle('fisicos')}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:11 }}>
          <Field label="m² cubiertos"><TextInput type="number" defaultValue={prop.m2Cubiertos} onCommit={v=>update('m2Cubiertos',v)} /></Field>
          <Field label="m² descubiertos"><TextInput type="number" defaultValue={prop.m2Descubiertos} onCommit={v=>update('m2Descubiertos',v)} /></Field>
          <Field label="m² ponderados" hint="cub + desc × 0.5"><div style={{ ...iS, background:c.surfaceAlt, color:c.textMuted }}>{fmtNum(m2pond,1)} m²</div></Field>
          <Field label="Antigüedad (años)"><TextInput type="number" defaultValue={prop.antiguedad} onCommit={v=>update('antiguedad',v)} /></Field>
          <Field label="Ambientes"><TextInput type="number" defaultValue={prop.ambientes} onCommit={v=>update('ambientes',v)} /></Field>
          <Field label="Dormitorios"><TextInput type="number" defaultValue={prop.dormitorios} onCommit={v=>update('dormitorios',v)} /></Field>
          <Field label="Baños"><TextInput type="number" defaultValue={prop.banos} onCommit={v=>update('banos',v)} /></Field>
          <Field label="Orientación"><Select value={prop.orientacion} onChange={v=>update('orientacion',v)} options={ORIENTACIONES} /></Field>
          <Field label="Piso"><TextInput type="number" defaultValue={prop.piso} onCommit={v=>update('piso',v)} /></Field>
          <Field label="Cochera"><div style={{ paddingTop:4 }}><Toggle checked={prop.cochera===true} onChange={v=>update('cochera',v)} label={prop.cochera?'Sí':'No'} /></div></Field>
          <Field label="Calefacción"><Select value={prop.calefaccion} onChange={v=>update('calefaccion',v)} options={CALEFACCIONES} /></Field>
          <Field label="Empresa de luz"><Select value={prop.empresaLuz} onChange={v=>update('empresaLuz',v)} options={EMPRESAS_LUZ} /></Field>
        </div>
        <div style={{ marginTop:12 }}>
          <Field label="Notas de estado"><TextArea defaultValue={prop.notasEstado} onCommit={v=>update('notasEstado',v)} placeholder="Humedad, techo, terminaciones..." /></Field>
        </div>
      </Section>

      {/* DATOS FINANCIEROS */}
      <Section icon={Wallet} title="Datos financieros" open={sec.financieros} onToggle={()=>toggle('financieros')}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:11, marginBottom:11 }}>
          <Field label="Precio pedido (USD)"><TextInput type="number" defaultValue={prop.precioPedido} onCommit={v=>update('precioPedido',v)} /></Field>
          <Field label="Expensas (ARS)"><TextInput type="number" defaultValue={prop.expensas} onCommit={v=>update('expensas',v)} /></Field>
          <Field label="Promedio del barrio (USD/m²)"><TextInput type="number" defaultValue={prop.promedioBarrio} onCommit={v=>update('promedioBarrio',v)} /></Field>
        </div>
        {isAdmin && (
          <>
            <div style={{ borderTop:`1px dashed ${c.border}`, paddingTop:14, marginTop:4 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:11 }}>
                <Lock size={12} style={{ color:c.accent }} />
                <span style={{ fontSize:12, fontWeight:600, color:c.accent }}>Datos privados</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:11 }}>
                <Field label="Precio máximo a pagar" locked><TextInput type="number" defaultValue={prop.precioMaximo} onCommit={v=>update('precioMaximo',v)} /></Field>
                <Field label="Primera oferta tentativa" locked><TextInput type="number" defaultValue={prop.primeraOferta} onCommit={v=>update('primeraOferta',v)} /></Field>
              </div>
            </div>
            <div style={{ borderTop:`1px dashed ${c.border}`, paddingTop:14, marginTop:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:11 }}>
                <Lock size={12} style={{ color:c.accent }} />
                <span style={{ fontSize:12, fontWeight:600, color:c.accent }}>Análisis de compra</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:11, marginBottom:14 }}>
                <div style={{ padding:'10px 14px', background:c.surfaceAlt, borderRadius:10, fontSize:13, color:c.textMuted, lineHeight:1.8 }}>
                  Comisión {analisis.comisionPct}% · Gastos {analisis.gastosPct}%{analisis.otrosPct>0?` · Otros ${analisis.otrosPct}%`:''} · <strong>Total {analisis.totalPct}%</strong>
                  <div style={{ fontSize:11, marginTop:2 }}>Editables en Configuración</div>
                </div>
              </div>
              {analisis.estado !== 'sin-datos' && (
                <>
                  <div style={{ background:c.surfaceAlt, borderRadius:10, padding:14, marginBottom:12, fontSize:13, lineHeight:1.9 }}>
                    {[
                      ['Precio pedido', fmtUSD(analisis.precio)],
                      [`+ Comisión (${analisis.comisionPct}%)`, fmtUSD(analisis.precio*analisis.comisionPct/100)],
                      [`+ Gastos (${analisis.gastosPct}%)`, fmtUSD(analisis.precio*analisis.gastosPct/100)],
                      ...(analisis.otrosPct>0 ? [[`+ Otros (${analisis.otrosPct}%)`, fmtUSD(analisis.precio*analisis.otrosPct/100)]] : []),
                    ].map(([l,v]) => (
                      <div key={l} style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:c.textMuted }}>{l}</span><span style={{ fontWeight:500 }}>{v}</span></div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', borderTop:`1px solid ${c.border}`, marginTop:7, paddingTop:7, fontWeight:600 }}><span>Costo total</span><span>{fmtUSD(analisis.costoTotal)}</span></div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}><span style={{ color:c.textMuted }}>− Total disponible</span><span>{fmtUSD(analisis.totalDisponible)}</span></div>
                  </div>
                  <div style={{ background:colAna.bg, border:`2px solid ${colAna.fg}40`, borderRadius:12, padding:16, display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:44, height:44, borderRadius:'50%', background:c.surface, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:shadow.sm }}>
                      {analisis.estado==='verde' ? <Check size={20} color={colAna.fg} strokeWidth={3} /> : analisis.estado==='amber' ? <AlertCircle size={20} color={colAna.fg} /> : <X size={20} color={colAna.fg} strokeWidth={3} />}
                    </div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:600, color:colAna.fg, marginBottom:2 }}>{analisis.resultado>=0 ? `Te sobran ${fmtUSD(analisis.resultado)}` : `Te faltan ${fmtUSD(Math.abs(analisis.resultado))}`}</div>
                      <div style={{ fontSize:12, color:colAna.fg, opacity:0.8 }}>Disponible: {fmtUSD(analisis.totalDisponible)} · Necesario: {fmtUSD(analisis.costoTotal)}</div>
                    </div>
                  </div>
                </>
              )}
              {analisis.totalDisponible === 0 && (
                <div style={{ marginTop:10, fontSize:12, color:c.amber, display:'flex', alignItems:'center', gap:5 }}><AlertCircle size={13} />Cargá los valores en "Presupuesto" para ver el cálculo.</div>
              )}
            </div>
          </>
        )}
      </Section>

      {/* EXCLUYENTES */}
      {(() => {
        // Cochera se lee de Datos físicos, no es toggle manual
        const cocheraActiva = (config?.excluyentesActivos || EXCLUYENTES_DEFAULT).includes('cochera');
        const totalExcl = excluyentesActivos.length + (cocheraActiva ? 1 : 0);
        const cocheraCumple = cocheraActiva ? prop.cochera === true : true;
        const cumpleTotal = exCumple === excluyentesActivos.length && cocheraCumple;
        const cumpleCount = exCumple + (cocheraActiva && cocheraCumple ? 1 : 0);
        return (
          <Section icon={ListChecks} title="Excluyentes" badge={<Badge bg={cumpleTotal?c.greenSoft:c.amberSoft} color={cumpleTotal?c.green:c.amber}>Cumple {cumpleCount}/{totalExcl}</Badge>} open={sec.excluyentes} onToggle={()=>toggle('excluyentes')}>
            {totalExcl === 0 ? (
              <div style={{ fontSize:13, color:c.textMuted, padding:'8px 0' }}>No hay excluyentes configurados. Definílos en Configuración.</div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(210px, 1fr))' }}>
                {excluyentesActivos.filter(e => e.id !== 'cochera').map(e => <Toggle key={e.id} checked={prop.excluyentes?.[e.id]===true} onChange={v=>update(`excluyentes.${e.id}`,v)} label={e.label} />)}
                {cocheraActiva && (
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'6px 0' }}>
                    <div style={{ width:38, height:22, borderRadius:11, background:prop.cochera?c.accent:'#D5D1C7', position:'relative', flexShrink:0, opacity:0.7 }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'white', position:'absolute', top:2, left:prop.cochera?18:2, boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                    <span style={{ fontSize:14, color:c.textMuted }}>Cochera <span style={{ fontSize:11, color:c.textSubtle }}>(desde Datos físicos)</span></span>
                  </div>
                )}
              </div>
            )}
          </Section>
        );
      })()}

      {/* PUNTAJES */}
      {isAdmin && (
        <Section icon={Star} title="Puntajes por criterio" locked preview={`${criterios.length} criterios`} open={sec.puntajes} onToggle={()=>toggle('puntajes')}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'0 26px' }}>
            {criterios.map(cr => <Slider key={cr.id} label={cr.label} weight={cr.peso} value={prop.puntajes?.[cr.id]} onChange={v=>update(`puntajes.${cr.id}`,v)} />)}
          </div>
        </Section>
      )}

      {/* DATOS DEL AVISO */}
      <Section icon={Info} title="Datos del aviso" open={sec.aviso} onToggle={()=>toggle('aviso')}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:11, marginBottom:14 }}>
          <Field label="Fecha de publicación"><TextInput type="date" defaultValue={prop.fechaPublicacion} onCommit={v=>update('fechaPublicacion',v)} /></Field>
          <Field label="Views actuales"><TextInput type="number" defaultValue={prop.views} onCommit={v=>update('views',v)} /></Field>
          <Field label="Cantidad de fotos"><TextInput type="number" defaultValue={prop.cantFotos} onCommit={v=>update('cantFotos',v)} /></Field>
          <Field label="Aviso destacado / premium"><div style={{ paddingTop:4 }}><Toggle checked={prop.destacado} onChange={v=>update('destacado',v)} label={prop.destacado?'Sí':'No'} /></div></Field>
        </div>
        <SemaforoDemanda prop={prop} update={update} />
        <HistorialPrecio prop={prop} update={update} />
      </Section>

      {/* MAPA Y DISTANCIAS */}
      <Section icon={Map} title="Mapa y distancias" open={sec.mapa} onToggle={()=>toggle('mapa')}>
        <MapaDistancias prop={prop} lugaresRef={config?.lugaresReferencia || []} update={update} isAdmin={isAdmin} />
      </Section>

      {/* PROCESO */}
      <Section icon={Info} title="Proceso y seguimiento" open={sec.proceso} onToggle={()=>toggle('proceso')}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:11 }}>
          <Field label="Estado"><Select value={prop.estado} onChange={v=>update('estado',v)} options={ESTADOS} /></Field>
          <Field label="Próxima acción"><TextInput defaultValue={prop.proximaAccion} onCommit={v=>update('proximaAccion',v)} /></Field>
        </div>
        {isAdmin && <Field label="Flexibilidad escrituración" locked><TextArea defaultValue={prop.flexEscrituracion} onCommit={v=>update('flexEscrituracion',v)} rows={2} /></Field>}
      </Section>

      {/* NEGOCIACIÓN */}
      {isAdmin && (
        <Section icon={Lock} title="Negociación" locked open={sec.negociacion} onToggle={()=>toggle('negociacion')}>
          <Field label="Motivo de venta" locked><TextInput defaultValue={prop.motivoVenta} onCommit={v=>update('motivoVenta',v)} placeholder="Sucesión, divorcio, mudanza..." /></Field>
          <Field label="¿El vendedor tiene apuro?" locked><Toggle checked={prop.duenoApurado} onChange={v=>update('duenoApurado',v)} label={prop.duenoApurado?'Sí':'No'} /></Field>
          <Field label="¿Hubo otras ofertas?" locked><TextInput defaultValue={prop.otrasOfertas} onCommit={v=>update('otrasOfertas',v)} /></Field>
          <Field label="Notas de negociación" locked><TextArea defaultValue={prop.notasNegociacion} onCommit={v=>update('notasNegociacion',v)} rows={4} /></Field>
        </Section>
      )}

      {/* LA VISITA */}
      <Section icon={MapPin} title="La visita" open={sec.visita} onToggle={()=>toggle('visita')}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:11, marginBottom:11 }}>
          <Field label="Fecha de la visita"><TextInput type="date" defaultValue={prop.visita?.fecha} onCommit={v=>update('visita.fecha',v)} /></Field>
          <Field label="¿Quién visitó?"><TextInput defaultValue={prop.visita?.quienVisito} onCommit={v=>update('visita.quienVisito',v)} placeholder="Ej: los dos, solo yo..." /></Field>
        </div>
        <Field label="Impresión post-visita">
          <TextArea
            defaultValue={prop.visita?.impresion}
            onCommit={v=>update('visita.impresion',v)}
            rows={6}
            placeholder={`Pensá en:\n• Olor / humedad / luz natural\n• Ruido (vecinos, calle, obra cerca)\n• Estado real vs fotos del aviso\n• Qué te encantó / qué te chocó\n• Entorno: parques, comercios, sensación del barrio\n• Cosas a mejorar y cuánto costaría`}
          />
        </Field>
        <Field label="Escuelas / jardines cercanos"><TextArea defaultValue={prop.escuelas} onCommit={v=>update('escuelas',v)} rows={2} /></Field>
        <Field label="Transporte más cercano"><TextInput defaultValue={prop.transporte} onCommit={v=>update('transporte',v)} placeholder="Subte, tren, colectivos..." /></Field>
      </Section>

      {/* NOTAS PRIVADAS */}
      {isAdmin && (
        <Section icon={Lock} title="Notas privadas" locked open={sec.notas} onToggle={()=>toggle('notas')}>
          <Field label="Notas privadas (solo admins)" locked><TextArea defaultValue={prop.notasPrivadas} onCommit={v=>update('notasPrivadas',v)} rows={5} /></Field>
        </Section>
      )}
    </div>
  );
};

// ============================================================
// RANKING
// ============================================================

// ============================================================
// COMPARADOR — modal lado a lado
// ============================================================

const semaforoVsBarrio = (usdM2Prop, promedioBarrio) => {
  if (!usdM2Prop || !promedioBarrio) return { estado:'sin-datos', label:'—', pct:null, fg:c.textMuted, bg:'#F0EFEB' };
  const diff = (usdM2Prop - promedioBarrio) / promedioBarrio * 100;
  if (diff <= -5) return { estado:'verde', label:'Oportunidad', pct:diff, fg:c.green, bg:c.greenSoft };
  if (diff >= 5)  return { estado:'rojo',  label:'Caro',         pct:diff, fg:c.red,   bg:c.redSoft };
  return                  { estado:'amber', label:'Justo',        pct:diff, fg:c.amber, bg:c.amberSoft };
};

const ComparadorModal = ({ propiedades, criterios, presupuesto, config, isAdmin, onClose, onSelectProp }) => {
  // Pre-computar datos por propiedad
  const datos = propiedades.map(p => {
    const m2pond = (p.m2Cubiertos||0) + (p.m2Descubiertos||0)*0.5;
    const usdM2 = m2pond>0 && p.precioPedido ? p.precioPedido/m2pond : null;
    const analisis = calcularAnalisis(p, presupuesto, config);
    const puntaje = calcularPuntaje(p.puntajes, criterios);
    const vsBarrio = semaforoVsBarrio(usdM2, p.promedioBarrio);
    const excluyentesAct = EXCLUYENTES_DISPONIBLES.filter(e => (config?.excluyentesActivos || EXCLUYENTES_DEFAULT).includes(e.id) && e.id !== 'cochera');
    const exCumple = excluyentesAct.filter(e => p.excluyentes?.[e.id]).length;
    const cocheraActiva = (config?.excluyentesActivos || EXCLUYENTES_DEFAULT).includes('cochera');
    const cocheraCumple = p.cochera === true;
    const totalExcl = excluyentesAct.length + (cocheraActiva ? 1 : 0);
    const cumpleExclCount = exCumple + (cocheraActiva && cocheraCumple ? 1 : 0);
    // Historial de bajadas
    const histPrecio = p.aviso?.historialPrecio || [];
    let bajadas = null;
    if (histPrecio.length >= 2) {
      const primero = histPrecio[0];
      const ultimo = histPrecio[histPrecio.length - 1];
      const diff = ultimo.precio - primero.precio;
      if (diff < 0) {
        const pct = primero.precio > 0 ? Math.abs(diff/primero.precio*100) : 0;
        bajadas = { count: histPrecio.length - 1, diff: Math.abs(diff), pct };
      }
    }
    return { p, m2pond, usdM2, analisis, puntaje, vsBarrio, totalExcl, cumpleExclCount, bajadas, histPrecio };
  });

  // Helpers para resaltar ganadores
  const winnerIdx = (values, mode) => {
    const valid = values.map((v,i) => ({v,i})).filter(x => x.v !== null && x.v !== undefined && !isNaN(x.v));
    if (valid.length < 2) return -1;
    let best = valid[0];
    for (const x of valid) {
      if (mode==='min' && x.v < best.v) best = x;
      if (mode==='max' && x.v > best.v) best = x;
    }
    // Si hay empate en el mejor valor, no resaltar
    const tied = valid.filter(x => x.v === best.v).length > 1;
    if (tied) return -1;
    return best.i;
  };

  const winnerVsBarrio = (() => {
    // Verde gana, después amber, después rojo. Si hay varios verdes -> el de menor pct (más barato)
    const order = { verde:0, amber:1, rojo:2, 'sin-datos':3 };
    const valid = datos.map((d,i) => ({d,i})).filter(x => x.d.vsBarrio.estado !== 'sin-datos');
    if (valid.length < 2) return -1;
    valid.sort((a,b) => {
      const oa = order[a.d.vsBarrio.estado], ob = order[b.d.vsBarrio.estado];
      if (oa !== ob) return oa - ob;
      return a.d.vsBarrio.pct - b.d.vsBarrio.pct;
    });
    const ties = valid.filter(x => x.d.vsBarrio.estado===valid[0].d.vsBarrio.estado && x.d.vsBarrio.pct===valid[0].d.vsBarrio.pct).length;
    if (ties > 1) return -1;
    return valid[0].i;
  })();

  const winners = {
    precioPedido: winnerIdx(datos.map(d => d.p.precioPedido||null), 'min'),
    usdM2:        winnerIdx(datos.map(d => d.usdM2), 'min'),
    m2pond:       winnerIdx(datos.map(d => d.m2pond||null), 'max'),
    ambientes:    winnerIdx(datos.map(d => d.p.ambientes||null), 'max'),
    banos:        winnerIdx(datos.map(d => d.p.banos||null), 'max'),
    antiguedad:   winnerIdx(datos.map(d => d.p.antiguedad===undefined||d.p.antiguedad===null?null:d.p.antiguedad), 'min'),
    excluyentes:  winnerIdx(datos.map(d => d.totalExcl>0 ? d.cumpleExclCount/d.totalExcl : null), 'max'),
    costoTotal:   winnerIdx(datos.map(d => d.analisis.estado!=='sin-datos' ? d.analisis.costoTotal : null), 'min'),
    vsPresup:     winnerIdx(datos.map(d => d.analisis.estado!=='sin-datos' ? d.analisis.resultado : null), 'max'),
    vsBarrio:     winnerVsBarrio,
  };

  const winnerStyle = (isWinner) => isWinner
    ? { background:c.greenSoft, borderRadius:6, padding:'3px 7px', display:'inline-block', fontWeight:600 }
    : {};

  const Row = ({ label, children, sticky }) => (
    <tr style={sticky ? { background:c.surfaceAlt } : {}}>
      <td style={{ padding:'11px 14px', fontSize:12, color:c.textMuted, fontWeight:500, borderBottom:`1px solid ${c.border}`, position:'sticky', left:0, background:c.surface, zIndex:1, minWidth:160 }}>{label}</td>
      {children}
    </tr>
  );

  const SectionHeader = ({ title, colspan }) => (
    <tr>
      <td colSpan={colspan} style={{ padding:'14px 14px 8px', fontSize:11, fontWeight:600, color:c.textSubtle, textTransform:'uppercase', letterSpacing:0.6, background:c.surface, position:'sticky', left:0 }}>{title}</td>
    </tr>
  );

  const cellStyle = { padding:'11px 14px', fontSize:13, borderBottom:`1px solid ${c.border}`, minWidth:180, verticalAlign:'top' };

  const colspan = datos.length + 1;

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.55)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'24px 12px' }}>
      <div style={{ background:c.surface, borderRadius:14, width:'100%', maxWidth:1100, boxShadow:shadow.lg, overflow:'hidden' }}>
        {/* Header del modal */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${c.border}`, background:c.surface, position:'sticky', top:0, zIndex:5 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700 }}>Comparador</div>
            <div style={{ fontSize:12, color:c.textMuted, marginTop:2 }}>{datos.length} propiedades · La mejor de cada fila se resalta en verde</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', cursor:'pointer', padding:8, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', color:c.textMuted }} onMouseEnter={e=>e.currentTarget.style.background=c.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <X size={20} />
          </button>
        </div>

        {/* Tabla scroll horizontal */}
        <div style={{ overflowX:'auto', maxHeight:'80vh', overflowY:'auto' }}>
          <table style={{ borderCollapse:'collapse', width:'100%' }}>
            <thead>
              <tr>
                <th style={{ background:c.surface, position:'sticky', left:0, top:0, zIndex:6, minWidth:160 }}></th>
                {datos.map(({p, puntaje}) => (
                  <th key={p.id} style={{ padding:'14px 14px', textAlign:'left', background:c.surfaceAlt, borderBottom:`2px solid ${c.border}`, position:'sticky', top:0, zIndex:4, minWidth:180 }}>
                    {p.fotos?.[0] && (
                      <div style={{ width:'100%', height:90, borderRadius:9, overflow:'hidden', marginBottom:10 }}>
                        <img src={p.fotos[0]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                      </div>
                    )}
                    <div style={{ fontSize:14, fontWeight:700, marginBottom:3 }}>{p.nombre || 'Sin nombre'}</div>
                    <div style={{ fontSize:11, color:c.textMuted, marginBottom:8 }}>
                      {p.zona || 'Sin zona'}{p.tipo?` · ${p.tipo}`:''}{p.ambientes?` · ${p.ambientes} amb`:''}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <div style={{ width:38, height:38, borderRadius:9, background:semaforoBg(puntaje), display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:colorPuntaje(puntaje) }}>{puntaje}</div>
                      <div style={{ fontSize:11, color:c.textMuted }}>Puntaje</div>
                    </div>
                    <button onClick={()=>{ onClose(); onSelectProp(p.id); }} style={{ fontSize:11, fontWeight:600, color:c.accent, background:'transparent', border:`1px solid ${c.accent}`, borderRadius:7, padding:'5px 9px', cursor:'pointer' }}>Ver ficha completa</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* PRECIO */}
              <SectionHeader title="Precio" colspan={colspan} />
              <Row label="Precio pedido">
                {datos.map((d,i) => (
                  <td key={d.p.id} style={cellStyle}>
                    <span style={winnerStyle(winners.precioPedido===i)}>{d.p.precioPedido ? fmtUSD(d.p.precioPedido) : '—'}</span>
                  </td>
                ))}
              </Row>
              <Row label="USD/m² propiedad">
                {datos.map((d,i) => (
                  <td key={d.p.id} style={cellStyle}>
                    <span style={winnerStyle(winners.usdM2===i)}>{d.usdM2 ? fmtUSD(d.usdM2) : '—'}</span>
                  </td>
                ))}
              </Row>
              <Row label="USD/m² barrio">
                {datos.map(d => (
                  <td key={d.p.id} style={{ ...cellStyle, color:c.textMuted }}>{d.p.promedioBarrio ? fmtUSD(d.p.promedioBarrio) : '—'}</td>
                ))}
              </Row>
              <Row label="Historial bajadas">
                {datos.map(d => (
                  <td key={d.p.id} style={cellStyle}>
                    {d.bajadas
                      ? <span style={{ color:c.green, fontWeight:500 }}>↓ Bajó {d.bajadas.pct.toFixed(1)}%</span>
                      : d.histPrecio.length >= 1
                        ? <span style={{ color:c.textMuted }}>Sin bajadas</span>
                        : <span style={{ color:c.textMuted }}>—</span>
                    }
                  </td>
                ))}
              </Row>

              {/* FÍSICO */}
              <SectionHeader title="Físico" colspan={colspan} />
              <Row label="m² cubiertos">
                {datos.map(d => <td key={d.p.id} style={cellStyle}>{d.p.m2Cubiertos ? `${fmtNum(d.p.m2Cubiertos,0)} m²` : '—'}</td>)}
              </Row>
              <Row label="m² descubiertos">
                {datos.map(d => <td key={d.p.id} style={cellStyle}>{d.p.m2Descubiertos ? `${fmtNum(d.p.m2Descubiertos,0)} m²` : '—'}</td>)}
              </Row>
              <Row label="m² ponderados">
                {datos.map((d,i) => (
                  <td key={d.p.id} style={cellStyle}>
                    <span style={winnerStyle(winners.m2pond===i)}>{d.m2pond > 0 ? `${fmtNum(d.m2pond,1)} m²` : '—'}</span>
                  </td>
                ))}
              </Row>
              <Row label="Ambientes">
                {datos.map((d,i) => (
                  <td key={d.p.id} style={cellStyle}>
                    <span style={winnerStyle(winners.ambientes===i)}>{d.p.ambientes || '—'}</span>
                  </td>
                ))}
              </Row>
              <Row label="Baños">
                {datos.map((d,i) => (
                  <td key={d.p.id} style={cellStyle}>
                    <span style={winnerStyle(winners.banos===i)}>{d.p.banos || '—'}</span>
                  </td>
                ))}
              </Row>
              <Row label="Antigüedad">
                {datos.map((d,i) => (
                  <td key={d.p.id} style={cellStyle}>
                    <span style={winnerStyle(winners.antiguedad===i)}>{d.p.antiguedad !== undefined && d.p.antiguedad !== null ? `${d.p.antiguedad} ${d.p.antiguedad===1?'año':'años'}` : '—'}</span>
                  </td>
                ))}
              </Row>
              <Row label="Cochera">
                {datos.map(d => <td key={d.p.id} style={cellStyle}>{d.p.cochera === true ? 'Sí' : d.p.cochera === false ? 'No' : '—'}</td>)}
              </Row>

              {/* ANÁLISIS VALORA */}
              <SectionHeader title="Análisis Valora" colspan={colspan} />
              <Row label="Precio vs barrio">
                {datos.map((d,i) => (
                  <td key={d.p.id} style={cellStyle}>
                    {d.vsBarrio.estado === 'sin-datos' ? (
                      <span style={{ color:c.textMuted }}>—</span>
                    ) : (
                      <Badge bg={winners.vsBarrio===i ? c.greenSoft : d.vsBarrio.bg} color={d.vsBarrio.fg}>
                        {d.vsBarrio.estado==='verde'?'🟢':d.vsBarrio.estado==='amber'?'🟡':'🔴'} {d.vsBarrio.label} ({d.vsBarrio.pct>=0?'+':''}{d.vsBarrio.pct.toFixed(1)}%)
                      </Badge>
                    )}
                  </td>
                ))}
              </Row>
              <Row label="Excluyentes">
                {datos.map((d,i) => (
                  <td key={d.p.id} style={cellStyle}>
                    {d.totalExcl > 0 ? (
                      <span style={winnerStyle(winners.excluyentes===i)}>{d.cumpleExclCount}/{d.totalExcl}</span>
                    ) : '—'}
                  </td>
                ))}
              </Row>
              {isAdmin && (
                <>
                  <Row label="Costo total">
                    {datos.map((d,i) => (
                      <td key={d.p.id} style={cellStyle}>
                        {d.analisis.estado !== 'sin-datos'
                          ? <span style={winnerStyle(winners.costoTotal===i)}>{fmtUSD(d.analisis.costoTotal)}</span>
                          : <span style={{ color:c.textMuted }}>—</span>
                        }
                      </td>
                    ))}
                  </Row>
                  <Row label="Vs presupuesto">
                    {datos.map((d,i) => {
                      if (d.analisis.estado === 'sin-datos') return <td key={d.p.id} style={cellStyle}><span style={{ color:c.textMuted }}>—</span></td>;
                      const colA = colorAnalisis(d.analisis.estado);
                      return (
                        <td key={d.p.id} style={cellStyle}>
                          <span style={winnerStyle(winners.vsPresup===i)}>
                            <span style={{ color:colA.fg, fontWeight:600 }}>{colA.label}</span>{' '}
                            <span style={{ color:c.textMuted, fontSize:12 }}>{d.analisis.resultado>=0?'+':'−'}{fmtUSDk(Math.abs(d.analisis.resultado))}</span>
                          </span>
                        </td>
                      );
                    })}
                  </Row>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// RANKING
// ============================================================

const RankingView = ({ propiedades, criterios, presupuesto, config, isAdmin, onSelectProp }) => {
  const { uid } = useUser();
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [comparadorAbierto, setComparadorAbierto] = useState(false);
  const handleSelectProp = (id) => { trackEvent(uid, 'detalleAbierto'); onSelectProp(id); };
  const abrirComparador = () => { trackEvent(uid, 'comparadorAbierto'); setComparadorAbierto(true); };

  const ranked = useMemo(() =>
    propiedades.filter(p => p.estado!=='Descartada' && cumpleExcluyentes(p, config?.excluyentesActivos, config?.ambientesMinimos))
      .map(p => ({ ...p, _puntaje:calcularPuntaje(p.puntajes,criterios), _analisis:calcularAnalisis(p,presupuesto,config) }))
      .sort((a,b) => b._puntaje - a._puntaje),
    [propiedades, criterios, presupuesto, config]
  );
  const top3 = ranked.slice(0,3);
  const resto = ranked.slice(3);

  const toggleSel = (id, e) => {
    if (e) e.stopPropagation();
    setSeleccionadas(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) return prev; // máximo 3
      return [...prev, id];
    });
  };

  const propsSeleccionadas = seleccionadas
    .map(id => ranked.find(p => p.id === id))
    .filter(Boolean);

  const Checkbox = ({ id, checked, disabled, size=18 }) => (
    <div onClick={(e)=>{ if (!disabled || checked) toggleSel(id, e); }}
         style={{
           width:size, height:size, borderRadius:5, border:`2px solid ${checked ? c.accent : c.border}`,
           background: checked ? c.accent : c.surface, cursor: (!disabled || checked) ? 'pointer' : 'not-allowed',
           display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 150ms',
           opacity: (!disabled || checked) ? 1 : 0.4
         }}
         title={disabled && !checked ? 'Máximo 3 propiedades' : ''}>
      {checked && <Check size={size-6} color="white" strokeWidth={3} />}
    </div>
  );

  const limitReached = seleccionadas.length >= 3;

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'30px 24px 110px' }}>
      <Hero eyebrow={`${ranked.length} ${ranked.length===1?'propiedad evaluada':'propiedades evaluadas'}`} titulo="Ranking" subtitulo="Ordenadas por puntaje ponderado · Marcá 2 o 3 para comparar" />
      {ranked.length === 0 ? (
        <Card style={{ textAlign:'center', padding:56, background:c.surfaceAlt }}>
          <Award size={28} style={{ color:c.textMuted, marginBottom:10 }} />
          <h3 style={{ margin:'0 0 7px', fontSize:16, fontWeight:600 }}>No hay propiedades en el ranking todavía</h3>
          <p style={{ margin:0, fontSize:14, color:c.textMuted, lineHeight:1.6 }}>Las propiedades se ordenan automáticamente según su puntaje ponderado. Para aparecer acá tienen que tener al menos un puntaje cargado y cumplir todos los excluyentes activos.</p>
        </Card>
      ) : (
        <>
          {top3.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${top3.length}, 1fr)`, gap:14, marginBottom:30 }}>
              {top3.map((p, i) => {
                const colA = colorAnalisis(p._analisis.estado);
                const isSel = seleccionadas.includes(p.id);
                const hColor = isAdmin && p._analisis.estado !== 'sin-datos'
                  ? (p._analisis.estado==='rojo'?'#F7C1C1':p._analisis.estado==='amber'?'#FAC775':'#C0DD97')
                  : semaforoBg(p._puntaje);
                return (
                  <Card key={p.id} hoverable onClick={()=>handleSelectProp(p.id)} style={isSel ? { outline:`2px solid ${c.accent}`, outlineOffset:-2 } : {}}>
                    <div style={{ height:120, background:hColor, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                      {p.fotos?.[0]
                        ? <img src={p.fotos[0]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', position:'absolute', inset:0 }} />
                        : <ImageIcon size={26} style={{ color:colorPuntaje(p._puntaje), opacity:0.35 }} />
                      }
                      <div style={{ position:'absolute', top:10, left:10, width:30, height:30, borderRadius:'50%', background:i===0?c.amber:c.surface, color:i===0?'white':c.text, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14, boxShadow:shadow.sm }}>{i+1}</div>
                      <div style={{ position:'absolute', top:10, right:10, display:'flex', gap:6, alignItems:'center' }}>
                        {isAdmin && p.favorita && (
                          <div style={{ width:24, height:24, borderRadius:'50%', background:c.surface, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:shadow.sm }}>
                            <Heart size={11} fill={c.accent} color={c.accent} />
                          </div>
                        )}
                        <div style={{ background:c.surface, borderRadius:6, padding:4, boxShadow:shadow.sm }}>
                          <Checkbox id={p.id} checked={isSel} disabled={limitReached} />
                        </div>
                      </div>
                    </div>
                    <div style={{ padding:13 }}>
                      <div style={{ fontSize:14, fontWeight:600, marginBottom:3 }}>{p.nombre||'Sin nombre'}</div>
                      <div style={{ fontSize:12, color:c.textMuted, marginBottom:9 }}>{p.zona} · {fmtUSD(p.precioPedido)}</div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                        <div style={{ fontSize:22, fontWeight:700, color:colorPuntaje(p._puntaje) }}>{p._puntaje}</div>
                        {isAdmin && p._analisis.estado !== 'sin-datos' && (
                          <Badge bg={colA.bg} color={colA.fg}>{p._analisis.resultado>=0?'+':'−'} {fmtUSDk(Math.abs(p._analisis.resultado))}</Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {resto.length > 0 && (
            <Card>
              {resto.map((p, i) => {
                const colA = colorAnalisis(p._analisis.estado);
                const isSel = seleccionadas.includes(p.id);
                return (
                  <div key={p.id} onClick={()=>handleSelectProp(p.id)}
                    style={{ padding:'13px 18px', display:'flex', alignItems:'center', gap:13, borderBottom:i<resto.length-1?`1px solid ${c.border}`:'none', cursor:'pointer', transition:'background 150ms', background: isSel ? c.surfaceAlt : 'transparent' }}
                    onMouseEnter={e=>{ if (!isSel) e.currentTarget.style.background=c.surfaceAlt; }}
                    onMouseLeave={e=>{ if (!isSel) e.currentTarget.style.background='transparent'; }}>
                    <Checkbox id={p.id} checked={isSel} disabled={limitReached} />
                    <div style={{ fontSize:13, color:c.textSubtle, fontWeight:600, width:32 }}>#{i+4}</div>
                    <div style={{ width:40, height:40, borderRadius:9, background:semaforoBg(p._puntaje), overflow:'hidden', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {p.fotos?.[0]
                        ? <img src={p.fotos[0]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                        : <ImageIcon size={14} style={{ color:colorPuntaje(p._puntaje), opacity:0.5 }} />
                      }
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, marginBottom:2 }}>{p.nombre||'Sin nombre'}</div>
                      <div style={{ fontSize:12, color:c.textMuted }}>{p.zona} · {fmtUSD(p.precioPedido)} · {p.estado}</div>
                    </div>
                    {isAdmin && p._analisis.estado !== 'sin-datos' && (
                      <Badge bg={colA.bg} color={colA.fg}>{p._analisis.resultado>=0?'+':'−'} {fmtUSDk(Math.abs(p._analisis.resultado))}</Badge>
                    )}
                    <div style={{ fontSize:20, fontWeight:700, color:colorPuntaje(p._puntaje), minWidth:34, textAlign:'right' }}>{p._puntaje}</div>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      {/* Barra flotante de comparar */}
      {seleccionadas.length > 0 && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:c.text, color:'white', padding:'12px 18px', borderRadius:14, boxShadow:shadow.lg, display:'flex', alignItems:'center', gap:14, zIndex:50 }}>
          <div style={{ fontSize:13, fontWeight:500 }}>
            {seleccionadas.length} {seleccionadas.length===1?'seleccionada':'seleccionadas'}
            {seleccionadas.length === 1 && <span style={{ opacity:0.7, marginLeft:6 }}>· marcá 1 más</span>}
            {limitReached && <span style={{ opacity:0.7, marginLeft:6 }}>· máximo alcanzado</span>}
          </div>
          <button
            onClick={abrirComparador}
            disabled={seleccionadas.length < 2}
            style={{
              background: seleccionadas.length >= 2 ? c.accent : '#555',
              color:'white', border:'none', borderRadius:9, padding:'8px 16px', fontSize:13, fontWeight:600,
              cursor: seleccionadas.length >= 2 ? 'pointer' : 'not-allowed',
              opacity: seleccionadas.length >= 2 ? 1 : 0.6
            }}>
            Comparar
          </button>
          <button onClick={()=>setSeleccionadas([])} style={{ background:'transparent', border:'none', color:'white', opacity:0.6, cursor:'pointer', padding:6, display:'flex', alignItems:'center' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Modal del comparador */}
      {comparadorAbierto && propsSeleccionadas.length >= 2 && (
        <ComparadorModal
          propiedades={propsSeleccionadas}
          criterios={criterios}
          presupuesto={presupuesto}
          config={config}
          isAdmin={isAdmin}
          onClose={()=>setComparadorAbierto(false)}
          onSelectProp={onSelectProp}
        />
      )}
    </div>
  );
};

// ============================================================
// DESCARTADAS
// ============================================================

const DescartadasView = ({ propiedades, config, isAdmin, onRecuperar, onSelectProp }) => {
  const desc = propiedades.filter(p =>
    p.estado === 'Descartada' || !cumpleExcluyentes(p, config?.excluyentesActivos, config?.ambientesMinimos)
  );
  const getMotivos = (prop) => {
    const motivos = [];
    if (prop.estado === 'Descartada') motivos.push('Marcada como descartada');
    if (!cumpleExcluyentes(prop, config?.excluyentesActivos, config?.ambientesMinimos)) {
      const activos = config?.excluyentesActivos || EXCLUYENTES_DEFAULT;
      const nosCumple = EXCLUYENTES_DISPONIBLES.filter(e =>
        activos.includes(e.id) && e.id !== 'cochera' && prop.excluyentes?.[e.id] !== true
      ).map(e => e.label);
      if (activos.includes('cochera') && prop.cochera !== true) nosCumple.push('Cochera');
      const minAmb = config?.ambientesMinimos || 0;
      if (minAmb > 0 && prop.ambientes && prop.ambientes < minAmb) nosCumple.push(`Mínimo ${minAmb} ambientes`);
      if (nosCumple.length > 0) motivos.push(`No cumple: ${nosCumple.join(', ')}`);
    }
    return motivos;
  };
  return (
    <div style={{ maxWidth:880, margin:'0 auto', padding:'30px 24px 64px' }}>
      <Hero eyebrow="Filtradas o marcadas" titulo="Descartadas" subtitulo='Propiedades con estado "Descartada" o que no cumplen los excluyentes' />
      {desc.length === 0 ? (
        <Card style={{ textAlign:'center', padding:56, background:c.surfaceAlt }}>
          <X size={28} style={{ color:c.textMuted, marginBottom:10 }} />
          <h3 style={{ margin:'0 0 7px', fontSize:16, fontWeight:600 }}>Sin descartadas</h3>
          <p style={{ margin:0, fontSize:14, color:c.textMuted }}>No hay propiedades descartadas todavía.</p>
        </Card>
      ) : (
        <Card>
          {desc.map((p, i) => {
            const motivos = getMotivos(p);
            return (
              <div key={p.id} style={{ padding:'15px 18px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, borderBottom:i<desc.length-1?`1px solid ${c.border}`:'none' }}>
                <div style={{ flex:1, cursor:'pointer', minWidth:0 }} onClick={()=>onSelectProp(p.id)}>
                  <div style={{ fontWeight:600, marginBottom:3, fontSize:14 }}>{p.nombre||'Sin nombre'}</div>
                  <div style={{ fontSize:12, color:c.textMuted, marginBottom:5 }}>{p.zona} · {fmtUSD(p.precioPedido)}</div>
                  {motivos.map((m, mi) => (
                    <div key={mi} style={{ fontSize:12, color:c.red, display:'flex', alignItems:'center', gap:4, marginBottom: mi < motivos.length-1 ? 3 : 0 }}>
                      <AlertCircle size={11} /> {m}
                    </div>
                  ))}
                </div>
                {isAdmin && p.estado==='Descartada' && <Button size="sm" variant="secondary" onClick={()=>onRecuperar(p.id)}>Recuperar</Button>}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
};

// ============================================================
// PESOS
// ============================================================

const PesosView = ({ criterios, setCriterios, isAdmin }) => {
  const upd = (id, peso) => {
    if (!isAdmin) return;
    setCriterios(cs => cs.map(cr => cr.id===id ? {...cr, peso} : cr));
  };
  const grupos = [
    { label:'Críticos', sub:'peso 5', f:cr=>cr.peso===5 },
    { label:'Importantes', sub:'peso 4', f:cr=>cr.peso===4 },
    { label:'Deseables', sub:'peso 3', f:cr=>cr.peso===3 },
    { label:'Lindo tenerlo', sub:'peso 1-2', f:cr=>cr.peso<=2 },
  ];
  return (
    <div style={{ maxWidth:740, margin:'0 auto', padding:'30px 24px 64px' }}>
      <Hero eyebrow="Configuración" titulo="Pesos de criterios" subtitulo={isAdmin ? "Ajustá qué tan importante es cada criterio · afecta el puntaje en tiempo real" : "Pesos definidos por los admins"} />

      <div style={{ marginBottom:16, padding:14, background:c.surfaceAlt, border:`1px solid ${c.border}`, borderRadius:12, fontSize:13, color:c.textMuted, lineHeight:1.7 }}>
        El peso (1 a 5) indica cuánto influye cada criterio en el puntaje final. <strong style={{ color:c.text }}>No es lo mismo que los excluyentes</strong>: los pesos suman o restan al número, los excluyentes son sí o no — si no se cumple, la propiedad queda descartada sin importar el puntaje.
      </div>

      <Card style={{ padding:24 }}>
        {grupos.map((g, gi) => {
          const items = criterios.filter(g.f);
          if (!items.length) return null;
          return (
            <div key={g.label} style={{ marginBottom:gi<grupos.length-1?28:0 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:14, paddingBottom:8, borderBottom:`1px solid ${c.border}` }}>
                <span style={{ fontSize:13, color:c.text, fontWeight:600 }}>{g.label}</span>
                <span style={{ fontSize:12, color:c.textSubtle }}>· {g.sub}</span>
              </div>
              {items.map(cr => (
                <div key={cr.id} style={{ marginBottom:18 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span style={{ fontSize:14 }}>
                      {cr.label}
                      {cr.tipo==='automatico' && <Badge bg={c.purpleSoft} color={c.purple} style={{ marginLeft:8, fontSize:10 }}>auto</Badge>}
                    </span>
                    <div style={{ display:'flex', gap:4 }}>
                      {[1,2,3,4,5].map(n => (
                        <div key={n} onClick={()=>upd(cr.id, n)} style={{ width:9, height:9, borderRadius:'50%', background:n<=cr.peso?c.purple:c.purpleSoft, cursor:isAdmin?'pointer':'default', transition:'background 150ms' }} />
                      ))}
                    </div>
                  </div>
                  <input type="range" min={1} max={5} value={cr.peso} disabled={!isAdmin} onChange={e=>upd(cr.id, parseInt(e.target.value))} style={{ width:'100%', accentColor:c.accent, cursor:isAdmin?'pointer':'not-allowed', opacity:isAdmin?1:0.6 }} />
                </div>
              ))}
            </div>
          );
        })}
      </Card>
    </div>
  );
};

// ============================================================
// PRESUPUESTO
// ============================================================

const PresupuestoView = ({ presupuesto, setPresupuesto }) => {
  const upd = (k, v) => setPresupuesto(p => ({ ...p, [k]: v }));
  const vProm = ((presupuesto.ventaMin||0) + (presupuesto.ventaMax||0)) / 2;
  const tMin = (presupuesto.ventaMin||0) + (presupuesto.ahorros||0) + (presupuesto.aportes||0);
  const tMax = (presupuesto.ventaMax||0) + (presupuesto.ahorros||0) + (presupuesto.aportes||0);
  const tProm = (tMin + tMax) / 2;
  const margen = tProm - (presupuesto.objetivo||0);
  const mColor = margen >= 0 ? c.green : c.red;
  const mBg = margen >= 0 ? c.greenSoft : c.redSoft;

  return (
    <div style={{ maxWidth:740, margin:'0 auto', padding:'30px 24px 64px' }}>
      <Hero
        eyebrow={<span style={{ display:'inline-flex', alignItems:'center', gap:5 }}><Lock size={11} /> Información privada · solo admins</span>}
        titulo="Presupuesto"
        subtitulo="Cifras de fondos disponibles para la compra"
      />
      <Card style={{ padding:24, marginBottom:12 }}>
        <div style={{ fontSize:11, color:c.textMuted, marginBottom:6 }}>Total disponible promedio</div>
        <div style={{ fontSize:36, fontWeight:700, marginBottom:3, letterSpacing:'-0.02em' }}>{fmtUSD(tProm)}</div>
        <div style={{ fontSize:13, color:c.textMuted }}>Rango: {fmtUSD(tMin)} – {fmtUSD(tMax)}</div>
        <div style={{ marginTop:20, paddingTop:18, borderTop:`1px solid ${c.border}`, display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
          {[
            ['Venta propiedad', fmtUSDk(vProm), `prom. ${fmtUSDk(presupuesto.ventaMin)}–${fmtUSDk(presupuesto.ventaMax)}`],
            ['Ahorros', fmtUSDk(presupuesto.ahorros), 'propios'],
            ['Aportes', fmtUSDk(presupuesto.aportes), 'adicionales'],
          ].map(([l,v,s]) => (
            <div key={l}>
              <div style={{ fontSize:11, color:c.textMuted, marginBottom:4 }}>{l}</div>
              <div style={{ fontSize:17, fontWeight:600 }}>{v}</div>
              <div style={{ fontSize:10, color:c.textSubtle, marginTop:2 }}>{s}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ padding:24, marginBottom:12 }}>
        <h3 style={{ margin:'0 0 16px', fontSize:15, fontWeight:600 }}>Fuentes</h3>
        <Field label="Venta propiedad actual (rango USD)" hint="Mínimo y máximo esperado">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9 }}>
            <TextInput type="number" defaultValue={presupuesto.ventaMin} onCommit={v=>upd('ventaMin',v)} placeholder="Mínimo" />
            <TextInput type="number" defaultValue={presupuesto.ventaMax} onCommit={v=>upd('ventaMax',v)} placeholder="Máximo" />
          </div>
        </Field>
        <Field label="Ahorros propios (USD)"><TextInput type="number" defaultValue={presupuesto.ahorros} onCommit={v=>upd('ahorros',v)} /></Field>
        <Field label="Aportes adicionales (USD)" hint="No es necesario detallar el origen"><TextInput type="number" defaultValue={presupuesto.aportes} onCommit={v=>upd('aportes',v)} /></Field>
      </Card>

      <Card style={{ padding:24, marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ margin:0, fontSize:15, fontWeight:600 }}>Objetivo de compra</h3>
          {presupuesto.objetivo && <Badge bg={mBg} color={mColor}>{margen>=0?'Cómodo':'Apretado'}</Badge>}
        </div>
        <Field label="Presupuesto objetivo (USD)" hint="Dejá margen para escritura, comisión, mudanza, reformas"><TextInput type="number" defaultValue={presupuesto.objetivo} onCommit={v=>upd('objetivo',v)} /></Field>
        <div style={{ borderTop:`1px solid ${c.border}`, paddingTop:14, marginTop:4, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, color:c.textMuted }}>Margen disponible</span>
          <span style={{ fontSize:18, fontWeight:700, color:mColor }}>{margen>=0?'+':'−'} {fmtUSD(Math.abs(margen))}</span>
        </div>
      </Card>

      <div style={{ padding:'12px 16px', background:c.surfaceAlt, border:`1px solid ${c.border}`, borderRadius:12, fontSize:12, color:c.textMuted }}>
        Los parámetros de compra (comisión, gastos, otros) se editan en <strong style={{ color:c.text }}>Configuración</strong>.
      </div>
    </div>
  );
};


// ============================================================
// CONFIGURACION VIEW
// ============================================================

const ConfiguracionView = ({ config, setConfig, criterios }) => {
  const updCfg = (k, v) => setConfig(cfg => ({ ...cfg, [k]: v }));

  const toggleBarrio = (barrio) => {
    const actual = config?.barriosDeseados || [];
    const nuevo = actual.includes(barrio)
      ? actual.filter(b => b !== barrio)
      : [...actual, barrio];
    updCfg('barriosDeseados', nuevo);
  };

  const barriosDeseados = config?.barriosDeseados || [];
  const lugaresRef = config?.lugaresReferencia || [];

  const agregarLugar = () => {
    if (lugaresRef.length >= 5) return;
    updCfg('lugaresReferencia', [...lugaresRef, { nombre: '', direccion: '' }]);
  };

  const actualizarLugar = (i, campo, valor) => {
    const nuevos = lugaresRef.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l);
    updCfg('lugaresReferencia', nuevos);
  };

  // Actualiza varios campos a la vez de un lugar (evita race conditions al guardar dirección + lat + lng)
  const actualizarLugarMulti = (i, cambios) => {
    const nuevos = lugaresRef.map((l, idx) => idx === i ? { ...l, ...cambios } : l);
    updCfg('lugaresReferencia', nuevos);
  };

  const eliminarLugar = (i) => {
    updCfg('lugaresReferencia', lugaresRef.filter((_, idx) => idx !== i));
  };

  return (
    <div style={{ maxWidth:740, margin:'0 auto', padding:'30px 24px 64px' }}>
      <Hero
        eyebrow={<span style={{ display:'inline-flex', alignItems:'center', gap:5 }}><Lock size={11} /> Solo admins</span>}
        titulo="Configuración"
        subtitulo="Personalizá Valora para tu búsqueda"
      />

      {/* PARÁMETROS DE COMPRA */}
      <Card style={{ padding:24, marginBottom:12 }}>
        <h3 style={{ margin:'0 0 6px', fontSize:15, fontWeight:600 }}>Parámetros de compra</h3>
        <p style={{ margin:'0 0 16px', fontSize:12, color:c.textMuted }}>Afectan el análisis de compra de todas las propiedades</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12 }}>
          <Field label="Comisión inmobiliaria (%)" hint="Estándar Argentina: 4%">
            <TextInput type="number" defaultValue={config?.comisionPct ?? 4}
              onCommit={v => updCfg('comisionPct', v===''?4:parseFloat(v))} />
          </Field>
          <Field label="Gastos de escritura (%)" hint="Sellos, escribano, etc.">
            <TextInput type="number" defaultValue={config?.gastosPct ?? 2}
              onCommit={v => updCfg('gastosPct', v===''?2:parseFloat(v))} />
          </Field>
          <Field label="Otros (%)" hint="Reformas, mudanza, lo que quieras sumar">
            <TextInput type="number" defaultValue={config?.otrosPct ?? 0}
              onCommit={v => updCfg('otrosPct', v===''?0:parseFloat(v))} />
          </Field>
        </div>
        <div style={{ marginTop:12, padding:'10px 14px', background:c.surfaceAlt, borderRadius:10, fontSize:13, color:c.textMuted }}>
          Total de costos sobre el precio: <strong style={{ color:c.text }}>{((config?.comisionPct??4)+(config?.gastosPct??2)+(config?.otrosPct??0)).toFixed(1)}%</strong>
        </div>
      </Card>

      {/* EXCLUYENTES CONFIGURABLES */}
      <Card style={{ padding:24, marginBottom:12 }}>
        <h3 style={{ margin:'0 0 6px', fontSize:15, fontWeight:600 }}>Excluyentes</h3>
        <p style={{ margin:'0 0 16px', fontSize:12, color:c.textMuted }}>
          Las propiedades que no cumplan estos requisitos quedan marcadas como descartadas automáticamente.
          {(config?.excluyentesActivos || EXCLUYENTES_DEFAULT).length > 0 && <> <strong style={{ color:c.text }}>{(config?.excluyentesActivos || EXCLUYENTES_DEFAULT).length} activos.</strong></>}
        </p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {EXCLUYENTES_DISPONIBLES.map(excl => {
            const activos = config?.excluyentesActivos || EXCLUYENTES_DEFAULT;
            const activo = activos.includes(excl.id);
            return (
              <button key={excl.id}
                onClick={() => {
                  const nuevos = activo ? activos.filter(id => id !== excl.id) : [...activos, excl.id];
                  updCfg('excluyentesActivos', nuevos);
                }}
                style={{ padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:FONT, transition:'all 150ms',
                  border:`1px solid ${activo ? c.accent : c.borderStrong}`,
                  background: activo ? c.accentSoft : c.surface,
                  color: activo ? c.accent : c.textMuted,
                }}>
                {excl.label}
              </button>
            );
          })}
        </div>

        {/* Selector ambientes mínimos */}
        <div style={{ marginTop:18, paddingTop:16, borderTop:`1px solid ${c.border}` }}>
          <div style={{ fontSize:12, fontWeight:600, color:c.textMuted, marginBottom:10 }}>Ambientes mínimos</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[{v:0,label:'Sin restricción'},{v:1,label:'1+'},{v:2,label:'2+'},{v:3,label:'3+'},{v:4,label:'4+'},{v:5,label:'5+'}].map(op => {
              const activo = (config?.ambientesMinimos || 0) === op.v;
              return (
                <button key={op.v} onClick={() => updCfg('ambientesMinimos', op.v)}
                  style={{ padding:'5px 14px', borderRadius:20, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:FONT, transition:'all 150ms',
                    border:`1px solid ${activo ? c.accent : c.borderStrong}`,
                    background: activo ? c.accentSoft : c.surface,
                    color: activo ? c.accent : c.textMuted,
                  }}>
                  {op.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize:11, color:c.textSubtle, marginTop:8 }}>
            Las propiedades con menos ambientes quedan descartadas automáticamente.
          </div>
        </div>
      </Card>

      {/* BARRIOS DESEADOS */}
      <Card style={{ padding:24, marginBottom:12 }}>
        <h3 style={{ margin:'0 0 6px', fontSize:15, fontWeight:600 }}>Barrios deseados</h3>
        <p style={{ margin:'0 0 16px', fontSize:12, color:c.textMuted }}>
          Las propiedades en estos barrios obtienen 10/10 en el criterio automático "Zona deseada".
          {barriosDeseados.length > 0 && <> <strong style={{ color:c.text }}>{barriosDeseados.length} seleccionados.</strong></>}
        </p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {ZONAS.filter(z => z !== 'Otra').map(barrio => {
            const activo = barriosDeseados.includes(barrio);
            return (
              <button key={barrio} onClick={() => toggleBarrio(barrio)}
                style={{ padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:FONT, transition:'all 150ms',
                  border:`1px solid ${activo ? c.accent : c.borderStrong}`,
                  background: activo ? c.accentSoft : c.surface,
                  color: activo ? c.accent : c.textMuted,
                }}>
                {barrio}
              </button>
            );
          })}
        </div>
        {barriosDeseados.length === 0 && (
          <div style={{ marginTop:12, fontSize:12, color:c.amber, display:'flex', alignItems:'center', gap:5 }}>
            <AlertCircle size={13} /> Sin barrios seleccionados — el criterio "Zona deseada" no aplica todavía.
          </div>
        )}
      </Card>

      {/* LUGARES DE REFERENCIA */}
      <Card style={{ padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
          <div>
            <h3 style={{ margin:'0 0 4px', fontSize:15, fontWeight:600 }}>Lugares de referencia</h3>
            <p style={{ margin:'0 0 16px', fontSize:12, color:c.textMuted }}>
              Se usan para calcular distancias en auto y mostrar rutas en el mapa de cada propiedad.
            </p>
          </div>
          {lugaresRef.length < 5 && (
            <Button variant="secondary" size="sm" onClick={agregarLugar}><Plus size={13} /> Agregar</Button>
          )}
        </div>

        {lugaresRef.length === 0 ? (
          <div style={{ textAlign:'center', padding:'24px 0', color:c.textMuted, fontSize:13 }}>
            <MapPin size={22} style={{ marginBottom:8, opacity:0.4 }} /><br/>
            Agregá lugares para calcular distancias (trabajo, colegio, etc.)
          </div>
        ) : (
          lugaresRef.map((lugar, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 2fr auto', gap:10, alignItems:'flex-end', marginBottom:12 }}>
              <Field label={i === 0 ? 'Nombre' : undefined}>
                <TextInput defaultValue={lugar.nombre} onCommit={v => actualizarLugar(i, 'nombre', v)} placeholder="Ej: Trabajo, Jardín..." />
              </Field>
              <Field label={i === 0 ? 'Dirección' : undefined}>
                <DireccionAutocomplete
                  value={lugar.direccion}
                  placeholder="Av. Corrientes 1234, CABA"
                  onSelect={({ direccion, lat, lng }) => {
                    // Usamos setConfig funcional para leer SIEMPRE el state más reciente,
                    // así no pisamos el nombre que pueda estar recién comprometido por blur.
                    setConfig(prev => {
                      const actuales = prev?.lugaresReferencia || [];
                      const nuevos = actuales.map((l, idx) =>
                        idx === i ? { ...l, direccion, lat, lng } : l
                      );
                      return { ...prev, lugaresReferencia: nuevos };
                    });
                  }}
                />
              </Field>
              <button onClick={() => eliminarLugar(i)}
                style={{ border:'none', background:'transparent', cursor:'pointer', color:c.red, padding:'10px 6px', marginBottom:14 }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
        {lugaresRef.length >= 5 && (
          <div style={{ fontSize:12, color:c.textMuted, marginTop:8 }}>Máximo 5 lugares.</div>
        )}
      </Card>
    </div>
  );
};

const AccesoDenegadoView = () => (
  <div style={{ maxWidth:600, margin:'80px auto', padding:'30px 24px', textAlign:'center' }}>
    <div style={{ width:64, height:64, borderRadius:'50%', background:c.amberSoft, margin:'0 auto 16px', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <Lock size={28} style={{ color:c.amber }} />
    </div>
    <h2 style={{ margin:'0 0 10px', fontSize:20, fontWeight:700 }}>Sección privada</h2>
    <p style={{ margin:0, color:c.textMuted, fontSize:14 }}>Esta sección solo está disponible para administradores.</p>
  </div>
);

// ============================================================
// LOADING SCREEN
// ============================================================

const LoadingScreen = ({ mensaje }) => (
  <div style={{ minHeight:'100vh', background:c.bg, fontFamily:FONT, display:'flex', alignItems:'center', justifyContent:'center' }}>
    <div style={{ textAlign:'center' }}>
      <div style={{ width:40, height:40, border:`3px solid ${c.border}`, borderTop:`3px solid ${c.accent}`, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
      <div style={{ fontSize:13, color:c.textMuted }}>{mensaje || 'Cargando...'}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  </div>
);

// ============================================================
// APP PRINCIPAL
// ============================================================

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loginError, setLoginError] = useState(null);

  const [view, setView] = useState('lista');
  const [propiedades, setPropiedades] = useState([]);
  const [criterios, setCriterios] = useState(CRITERIOS_DEFAULT);
  const [presupuesto, setPresupuesto] = useState({ ventaMin:0, ventaMax:0, ahorros:0, aportes:0, objetivo:0 });
  const [config, setConfig] = useState({ comisionPct:4, gastosPct:2, otrosPct:0, barriosDeseados:[], lugaresReferencia:[], excluyentesActivos:['terraza','banoCompleto','cocinaAmplia','luminoso','expensasBajas','listoVivir','gasNatural'], ambientesMinimos:0 });
  const [usuarios, setUsuarios] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filtros, setFiltros] = useState({ zona:'', estado:'', busqueda:'', soloFavoritas:false });
  const [showGestion, setShowGestion] = useState(false);
  const [showGuia, setShowGuia] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [showMigracion, setShowMigracion] = useState(false);
  const [migracionDisponible, setMigracionDisponible] = useState(false);

  const isAdmin = true; // sandbox por usuario: cada uno es admin de su propia data
  const isApproved = true; // sandbox por usuario: entrada directa, sin aprobación

  // 1. Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            onboardingVisto: false,
            createdAt: new Date().toISOString(),
          });
        }
        setUserDoc({ id: user.uid, email: user.email, displayName: user.displayName });
        await trackLogin(user.uid, user.email, user.displayName || user.email.split('@')[0]);
        if (user.email === SUPER_ADMIN_EMAIL) {
          try {
            const viejasSnap = await getDocs(collection(db, 'propiedades'));
            const nuevasSnap = await getDocs(collection(db, 'users', user.uid, 'propiedades'));
            if (viejasSnap.docs.length > 0 && nuevasSnap.docs.length === 0) setMigracionDisponible(true);
          } catch { /* ignore */ }
        }
      } else {
        setUserDoc(null);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // 2. Data listeners (solo si aprobado)
  useEffect(() => {
    if (!isApproved || !firebaseUser) return;
    setDataLoading(true);
    const unsubs = [];

    unsubs.push(onSnapshot(collection(db, 'users', firebaseUser.uid, 'propiedades'), (snap) => {
      const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPropiedades(props);
      trackStatsSnapshot(firebaseUser.uid, props);
    }));

    unsubs.push(onSnapshot(doc(db, 'users', firebaseUser.uid, 'config', 'main'), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.criterios) {
          // Si los criterios guardados no tienen campo 'tipo', son del sistema viejo → migrar
          const necesitaMigrar = data.criterios.some(cr => !cr.tipo);
          if (necesitaMigrar) {
            await updateDoc(doc(db, 'users', firebaseUser.uid, 'config', 'main'), { criterios: CRITERIOS_DEFAULT });
            setCriterios(CRITERIOS_DEFAULT);
          } else {
            setCriterios(data.criterios);
          }
        }
        if (data.presupuesto) setPresupuesto(data.presupuesto);
        if (data.configuracion) {
          const cfg = data.configuracion;
          // Migrar: si no tiene excluyentesActivos, agregar el default
          if (!cfg.excluyentesActivos) {
            cfg.excluyentesActivos = EXCLUYENTES_DEFAULT;
            await updateDoc(doc(db, 'users', firebaseUser.uid, 'config', 'main'), { 'configuracion.excluyentesActivos': EXCLUYENTES_DEFAULT });
          }
          // Migrar: sacar ambientes3 si estaba en excluyentesActivos
          if (cfg.excluyentesActivos.includes('ambientes3')) {
            cfg.excluyentesActivos = cfg.excluyentesActivos.filter(id => id !== 'ambientes3');
            await updateDoc(doc(db, 'users', firebaseUser.uid, 'config', 'main'), { 'configuracion.excluyentesActivos': cfg.excluyentesActivos });
          }
          if (cfg.ambientesMinimos == null) cfg.ambientesMinimos = 0;
          setConfig(cfg);
        }
      } else {
        await setDoc(doc(db, 'users', firebaseUser.uid, 'config', 'main'), {
          criterios: CRITERIOS_DEFAULT,
          presupuesto: { ventaMin:0, ventaMax:0, ahorros:0, aportes:0, objetivo:0 },
          configuracion: { comisionPct:4, gastosPct:2, otrosPct:0, barriosDeseados:[], lugaresReferencia:[], excluyentesActivos:EXCLUYENTES_DEFAULT, ambientesMinimos:0 },
        });
      }
      setDataLoading(false);
    }));

    getDoc(doc(db, 'users', firebaseUser.uid)).then(snap => {
      if (snap.exists() && !snap.data().onboardingVisto) setShowOnboarding(true);
    });

    return () => unsubs.forEach(u => u());
  }, [isApproved, isAdmin, firebaseUser]);

  // Onboarding
  const handleCerrarOnboarding = async () => {
    setShowOnboarding(false);
    if (firebaseUser) {
      await updateDoc(doc(db, 'users', firebaseUser.uid), { onboardingVisto: true });
      await updateDoc(doc(db, 'users', firebaseUser.uid, 'stats', 'main'), { onboardingCompleto: true, ultimaActualizacion: new Date().toISOString() }).catch(() => {});
    }
  };

  // Auth handlers
  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user') return;
      setLoginError(e.message || 'Error al iniciar sesión');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('lista');
    setSelectedId(null);
  };

  // Usuarios handlers eliminados — sandbox por usuario, sin aprobación

  // Propiedades handlers
  const onNuevaProp = useCallback(async () => {
    if (!firebaseUser) return;
    const nueva = { nombre:'Nueva propiedad', estado:'Para visitar', excluyentes:{}, puntajes:{}, favorita:false, gastosPct:2, createdAt: new Date().toISOString() };
    const docRef = await addDoc(collection(db, 'users', firebaseUser.uid, 'propiedades'), nueva);
    trackEvent(firebaseUser.uid, 'propiedadesCreadas');
    setSelectedId(docRef.id);
  }, [firebaseUser]);

  const onDelete = useCallback(async () => {
    if (!confirm('¿Eliminar esta propiedad? Esta acción no se puede deshacer.')) return;
    await deleteDoc(doc(db, 'users', firebaseUser.uid, 'propiedades', selectedId));
    setSelectedId(null);
  }, [firebaseUser, selectedId]);

  const setPropActual = useCallback((updater) => {
    setPropiedades(prev => {
      const prop = prev.find(p => p.id === selectedId);
      if (!prop) return prev;
      const nuevoProp = typeof updater === 'function' ? updater(prop) : updater;
      const { id, ...data } = nuevoProp;
      updateDoc(doc(db, 'users', firebaseUser.uid, 'propiedades', selectedId), data).catch(console.error);
      return prev.map(p => p.id === selectedId ? nuevoProp : p);
    });
  }, [firebaseUser, selectedId]);

  const onRecuperar = useCallback(async (id) => {
    await updateDoc(doc(db, 'users', firebaseUser.uid, 'propiedades', id), { estado: 'Para visitar' });
  }, [firebaseUser]);

  // Config/criterios/presupuesto handlers (guardan en Firestore)
  const setCriteriosFirestore = useCallback((updater) => {
    setCriterios(prev => {
      const nuevos = typeof updater === 'function' ? updater(prev) : updater;
      updateDoc(doc(db, 'users', firebaseUser.uid, 'config', 'main'), { criterios: nuevos }).catch(console.error);
      updateDoc(doc(db, 'users', firebaseUser.uid, 'stats', 'main'), { criteriosConfigurados: true, ultimaActualizacion: new Date().toISOString() }).catch(console.error);
      trackEvent(firebaseUser.uid, 'criteriosEditados');
      return nuevos;
    });
  }, [firebaseUser]);

  const setPresupuestoFirestore = useCallback((updater) => {
    setPresupuesto(prev => {
      const nuevo = typeof updater === 'function' ? updater(prev) : updater;
      updateDoc(doc(db, 'users', firebaseUser.uid, 'config', 'main'), { presupuesto: nuevo }).catch(console.error);
      updateDoc(doc(db, 'users', firebaseUser.uid, 'stats', 'main'), { presupuestoConfigurado: true, ultimaActualizacion: new Date().toISOString() }).catch(console.error);
      trackEvent(firebaseUser.uid, 'presupuestoEditado');
      return nuevo;
    });
  }, [firebaseUser]);

  const setConfigFirestore = useCallback((updater) => {
    setConfig(prev => {
      const nuevo = typeof updater === 'function' ? updater(prev) : updater;
      updateDoc(doc(db, 'users', firebaseUser.uid, 'config', 'main'), { configuracion: nuevo }).catch(console.error);
      return nuevo;
    });
  }, [firebaseUser]);

  useEffect(() => { if (!isAdmin && (view === 'presupuesto' || view === 'configuracion')) setView('lista'); }, [isAdmin, view]);

  // === RENDER ===

  if (authLoading) return <LoadingScreen mensaje="Verificando sesión..." />;
  if (!firebaseUser) return <LoginScreen onLogin={handleLogin} error={loginError} />;
  if (!isApproved) return <WaitingScreen user={firebaseUser} onLogout={handleLogout} />;
  if (dataLoading) return <LoadingScreen mensaje="Cargando datos..." />;

  const propActual = propiedades.find(p => p.id === selectedId);
  const pendientes = usuarios.filter(u => u.estado === 'pendiente').length;

  return (
    <UserContext.Provider value={{ uid: firebaseUser?.uid }}>
    <div style={{ minHeight:'100vh', background:c.bg, fontFamily:FONT, color:c.text }}>
      <NavBar
        view={view}
        setView={v => { setView(v); setSelectedId(null); }}
        currentUser={firebaseUser}
        isAdmin={isAdmin}
        propiedades={propiedades}
        pendientes={pendientes}
        onLogout={handleLogout}
        onAbrirGuia={() => setShowGuia(true)}
        onAbrirMigracion={() => setShowMigracion(true)}
        migracionDisponible={migracionDisponible}
      />
      {showMigracion && <MigracionModal uid={firebaseUser.uid} onClose={() => setShowMigracion(false)} />}

      {showOnboarding && <OnboardingModal onClose={handleCerrarOnboarding} />}
      {showGuia && <GuiaModal onClose={() => setShowGuia(false)} />}

      {selectedId && propActual ? (
        <DetalleView
          prop={propActual}
          setProp={setPropActual}
          criterios={criterios}
          presupuesto={presupuesto}
          config={config}
          isAdmin={isAdmin}
          userId={firebaseUser?.uid}
          onBack={() => setSelectedId(null)}
          onDelete={onDelete}
        />
      ) : (
        <>
          {view === 'lista' && <ListaView propiedades={propiedades} criterios={criterios} presupuesto={presupuesto} config={config} isAdmin={isAdmin} filtros={filtros} setFiltros={setFiltros} onSelectProp={setSelectedId} onNuevaProp={onNuevaProp} />}
          {view === 'ranking' && <RankingView propiedades={propiedades} criterios={criterios} presupuesto={presupuesto} config={config} isAdmin={isAdmin} onSelectProp={setSelectedId} />}
          {view === 'descartadas' && <DescartadasView propiedades={propiedades} config={config} isAdmin={isAdmin} onRecuperar={onRecuperar} onSelectProp={setSelectedId} />}
          {view === 'pesos' && <PesosView criterios={criterios} setCriterios={setCriteriosFirestore} isAdmin={isAdmin} />}
          {view === 'presupuesto' && (isAdmin ? <PresupuestoView presupuesto={presupuesto} setPresupuesto={setPresupuestoFirestore} /> : <AccesoDenegadoView />)}
          {view === 'configuracion' && (isAdmin ? <ConfiguracionView config={config} setConfig={setConfigFirestore} criterios={criterios} /> : <AccesoDenegadoView />)}
        </>
      )}
      <div style={{ textAlign:'center', padding:'24px', borderTop:`1px solid ${c.border}`, marginTop:40 }}>
        <span style={{ fontSize:12, color:c.textSubtle, fontStyle:'italic' }}>Buscás en Zonaprop, decidís en Valora.</span>
      </div>
    </div>
    </UserContext.Provider>
  );
}