import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Home, MapPin, Heart, Lock, Plus, X, Check, Trash2, ChevronDown, ChevronRight, AlertCircle, Search, ArrowLeft, Wallet, Award, Image as ImageIcon, Ruler, Info, Star, ListChecks, SlidersHorizontal, Settings, LogOut, UserCheck, Clock } from 'lucide-react';
import { auth, googleProvider, db } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';

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

const TIPOS = ['PH','Casa','Departamento','Semipiso','Piso','Dúplex','Monoambiente','Loft','Penthouse','Triplex','Otro'];
const SUBTIPOS = ['Estándar','Semipiso','Piso','Dúplex','Monoambiente','Loft','Penthouse','Triplex'];
const DISPOSICIONES = ['Frente','Contrafrente','Interior','Lateral'];
const ANUNCIANTES = ['Inmobiliaria','Dueño directo'];

const EXCLUYENTES = [
  {id:'terraza',label:'Terraza / Jardín / Patio'},
  {id:'ambientes3',label:'Mínimo 3 ambientes'},
  {id:'banoCompleto',label:'1 baño completo'},
  {id:'cocinaAmplia',label:'Cocina amplia'},
  {id:'luminoso',label:'Luminoso'},
  {id:'expensasBajas',label:'Expensas bajas'},
  {id:'listoVivir',label:'Listo para vivir'},
  {id:'gasNatural',label:'Gas natural'},
];

// 12 criterios nuevos: 3 automáticos (zona, cochera, distancia) + 9 manuales
const CRITERIOS_DEFAULT = [
  {id:'zonaDeseada',    label:'Zona deseada',                        peso:5, tipo:'automatico'},
  {id:'distancia',      label:'Distancia a lugares de referencia',   peso:4, tipo:'automatico'},
  {id:'tamano',         label:'Tamaño general (m² ponderados)',       peso:4, tipo:'manual'},
  {id:'ambientes',      label:'Cantidad de ambientes',               peso:4, tipo:'manual'},
  {id:'estado',         label:'Estado / terminaciones',              peso:3, tipo:'manual'},
  {id:'luminosidad',    label:'Luminosidad',                         peso:3, tipo:'manual'},
  {id:'exterior',       label:'Espacio exterior (terraza/balcón/jardín)', peso:4, tipo:'manual'},
  {id:'cochera',        label:'Cochera',                             peso:3, tipo:'automatico'},
  {id:'modificable',    label:'Posibilidad de modificar / ampliar',  peso:3, tipo:'manual'},
  {id:'tranquilidad',   label:'Tranquilidad del barrio',             peso:3, tipo:'manual'},
  {id:'ruido',          label:'Ruido percibido',                     peso:2, tipo:'manual'},
  {id:'comodidades',    label:'Comodidades extra (parrilla/SUM/pileta)', peso:3, tipo:'manual'},
];

const ESTADOS = ['Para visitar','Visitada','Oferta hecha','En negociación','Descartada'];
const ORIENTACIONES = ['N','S','E','O','NE','NO','SE','SO'];
const CALEFACCIONES = ['Radiadores','Splits','Losa radiante','Otro'];
const EMPRESAS_LUZ = ['Edenor','Edesur','Otra'];

// Email del super-admin. Se aprueba automáticamente la primera vez.
// Para sumarlo a otro usuario, hacerlo desde "Gestionar usuarios".
const SUPER_ADMIN_EMAIL = 'jipochettino@gmail.com';

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

const shadow = { sm:'0 1px 2px rgba(30,45,74,0.06)', hover:'0 8px 28px rgba(30,45,74,0.14)' };
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ============================================================
// HELPERS
// ============================================================

const fmtUSD = n => (n==null||n===''||isNaN(n)) ? '—' : new Intl.NumberFormat('es-AR',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const fmtUSDk = n => (n==null||n===''||isNaN(n)) ? '—' : Math.abs(n)>=1000 ? `USD ${(n/1000).toFixed(0)}k` : fmtUSD(n);
const fmtNum = (n,d=0) => (n==null||n===''||isNaN(n)) ? '—' : new Intl.NumberFormat('es-AR',{maximumFractionDigits:d}).format(n);

// Calcula puntajes automáticos según datos de la propiedad y config
const calcularPuntajesAuto = (prop, config) => {
  const auto = {};
  // Zona deseada: si el barrio está en la lista → 10, si no → 0
  const barriosDeseados = config?.barriosDeseados || [];
  auto.zonaDeseada = barriosDeseados.length > 0
    ? (barriosDeseados.includes(prop.zona) ? 10 : 0)
    : null; // null = sin datos, no penaliza
  // Cochera: booleano → 10 ó 0
  auto.cochera = prop.cochera === true ? 10 : prop.cochera === false ? 0 : null;
  // Distancia: pendiente Google Maps (Etapa 3.4) → null hasta implementar
  auto.distancia = null;
  return auto;
};

const calcularPuntaje = (puntajes, criterios, prop, config) => {
  const auto = calcularPuntajesAuto(prop || {}, config || {});
  let sN=0, sD=0;
  criterios.forEach(cr => {
    let s;
    if (cr.tipo === 'automatico') {
      s = auto[cr.id];
    } else {
      s = puntajes?.[cr.id];
    }
    if (s != null && !isNaN(s)) { sN += s * cr.peso; sD += 10 * cr.peso; }
  });
  return sD===0 ? 0 : Math.round((sN/sD)*100);
};

const colorPuntaje = p => p>=80 ? c.green : p>=60 ? c.amber : c.red;
const semaforoBg = p => p>=80 ? '#C0DD97' : p>=60 ? '#FAC775' : '#F7C1C1';
const cumpleExcluyentes = prop => EXCLUYENTES.every(e => prop.excluyentes?.[e.id]===true);

const calcularAnalisis = (prop, pres, comisionPct) => {
  const com = comisionPct ?? 4;
  const gPct = prop.gastosPct ?? 2;
  const vP = ((pres?.ventaMin||0)+(pres?.ventaMax||0))/2;
  const total = vP + (pres?.ahorros||0) + (pres?.aportes||0);
  const precio = prop.precioPedido||0;
  const costo = precio * (1 + (com + gPct)/100);
  const res = total - costo;
  const mRel = precio>0 ? res/precio : 0;
  const estado = !precio ? 'sin-datos' : res>=0&&mRel>=0.05 ? 'verde' : res>=0 ? 'amber' : 'rojo';
  return { resultado:res, costoTotal:costo, totalDisponible:total, ventaProm:vP, precio, gastosPct:gPct, comisionPct:com, estado, margenRel:mRel };
};

const colorAnalisis = e => e==='verde'?{fg:c.green,bg:c.greenSoft,label:'Sobra'} : e==='amber'?{fg:c.amber,bg:c.amberSoft,label:'Justo'} : e==='rojo'?{fg:c.red,bg:c.redSoft,label:'Falta'} : {fg:c.textMuted,bg:'#F0EFEB',label:'—'};

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

const NavBar = ({ view, setView, currentUser, isAdmin, propiedades, pendientes, onLogout, onAbrirGestionUsuarios }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  const items = [
    { id:'lista', label:'Propiedades', icon:Home },
    { id:'ranking', label:'Ranking', icon:Award },
    { id:'descartadas', label:'Descartadas', icon:X },
    { id:'pesos', label:'Pesos', icon:SlidersHorizontal },
    ...(isAdmin ? [{ id:'presupuesto', label:'Presupuesto', icon:Wallet, locked:true }] : []),
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
  const puntaje = calcularPuntaje(prop.puntajes, criterios, prop, config);
  const cumple = cumpleExcluyentes(prop);
  const analisis = calcularAnalisis(prop, presupuesto, config?.comisionPct);
  const colAna = colorAnalisis(analisis.estado);
  const m2pond = (prop.m2Cubiertos||0) + (prop.m2Descubiertos||0)*0.5;
  const hColor = isAdmin && analisis.estado !== 'sin-datos'
    ? (analisis.estado==='rojo'?'#F7C1C1':analisis.estado==='amber'?'#FAC775':'#C0DD97')
    : semaforoBg(puntaje);
  const eColor = prop.estado==='Visitada'?c.green : (prop.estado==='Oferta hecha'||prop.estado==='En negociación')?c.purple : prop.estado==='Descartada'?c.red : c.amber;

  return (
    <Card hoverable onClick={onClick} style={{ opacity:(prop.estado==='Descartada'||!cumple)?0.55:1 }}>
      <div style={{ height:140, background:hColor, position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <ImageIcon size={30} style={{ color:colorPuntaje(puntaje), opacity:0.35 }} />
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
  const filtradas = useMemo(() => propiedades.filter(p => {
    if (filtros.zona && p.zona !== filtros.zona) return false;
    if (filtros.estado && p.estado !== filtros.estado) return false;
    if (filtros.busqueda) {
      const q = filtros.busqueda.toLowerCase();
      if (!(p.nombre||'').toLowerCase().includes(q) && !(p.zona||'').toLowerCase().includes(q) && !(p.direccion||'').toLowerCase().includes(q)) return false;
    }
    if (isAdmin && filtros.soloFavoritas && !p.favorita) return false;
    return true;
  }).sort((a,b) => calcularPuntaje(b.puntajes,criterios,b,config) - calcularPuntaje(a.puntajes,criterios,a,config)), [propiedades, criterios, filtros, isAdmin, config]);

  const zonas = useMemo(() => {
    const ct={}; propiedades.forEach(p => { if(p.zona) ct[p.zona]=(ct[p.zona]||0)+1; });
    return Object.entries(ct).sort((a,b) => b[1]-a[1]);
  }, [propiedades]);

  const topProp = useMemo(() => {
    const activas = propiedades.filter(p => p.estado !== 'Descartada' && cumpleExcluyentes(p)).map(p => ({...p, _puntaje:calcularPuntaje(p.puntajes,criterios,p,config)}));
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
            {propiedades.length===0 ? 'Sin propiedades cargadas todavía' : 'Sin resultados con esos filtros'}
          </h3>
          <p style={{ margin:'0 0 16px', color:c.textMuted, fontSize:14 }}>
            {propiedades.length===0 ? (isAdmin ? 'Hacé click en "Nueva propiedad" para arrancar.' : 'Los admins todavía no cargaron propiedades.') : 'Probá quitar algún filtro.'}
          </p>
          {propiedades.length===0 && isAdmin && <Button variant="primary" onClick={onNuevaProp}><Plus size={15} /> Nueva propiedad</Button>}
        </Card>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:18 }}>
          {filtradas.map(prop => <PropCard key={prop.id} prop={prop} criterios={criterios} presupuesto={presupuesto} config={config} isAdmin={isAdmin} onClick={()=>onSelectProp(prop.id)} />)}
        </div>
      )}
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
// DETALLE VIEW
// ============================================================

const DetalleView = ({ prop, setProp, criterios, presupuesto, config, isAdmin, onBack, onDelete }) => {
  const [sec, setSec] = useState({ ident:true, fisicos:false, financieros:true, excluyentes:false, puntajes:true, aviso:false, proceso:false, negociacion:false, entorno:false, notas:false });
  const toggle = k => setSec(s => ({ ...s, [k]: !s[k] }));
  const update = (path, value) => {
    const keys = path.split('.');
    const np = { ...prop };
    let cur = np;
    for (let i = 0; i < keys.length-1; i++) { cur[keys[i]] = { ...cur[keys[i]] }; cur = cur[keys[i]]; }
    cur[keys[keys.length-1]] = value;
    setProp(np);
  };

  const puntaje = calcularPuntaje(prop.puntajes, criterios, prop, config);
  const analisis = calcularAnalisis(prop, presupuesto, config?.comisionPct);
  const colAna = colorAnalisis(analisis.estado);
  const m2pond = (prop.m2Cubiertos||0) + (prop.m2Descubiertos||0)*0.5;
  const usdM2 = m2pond>0 && prop.precioPedido ? prop.precioPedido/m2pond : null;
  const exCumple = EXCLUYENTES.filter(e => prop.excluyentes?.[e.id]).length;
  const heroColor = isAdmin && analisis.estado!=='sin-datos'
    ? (analisis.estado==='rojo'?'#F7C1C1':analisis.estado==='amber'?'#FAC775':'#C0DD97')
    : semaforoBg(puntaje);

  // Puntajes automáticos calculados
  const autoScores = calcularPuntajesAuto(prop, config);

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
            <Button variant="danger" size="sm" onClick={onDelete}><Trash2 size={13} /></Button>
          </div>
        )}
      </div>

      <Card style={{ marginBottom:14, padding:22 }}>
        <div style={{ display:'flex', gap:18, alignItems:'flex-start' }}>
          <div style={{ width:96, height:96, borderRadius:14, background:heroColor, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <ImageIcon size={30} style={{ color:colorPuntaje(puntaje), opacity:0.45 }} />
          </div>
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
          <Field label="Dirección"><TextInput defaultValue={prop.direccion} onCommit={v=>update('direccion',v)} placeholder="Calle 1234" /></Field>
          <Field label="Zona / Barrio"><Select value={prop.zona} onChange={v=>update('zona',v)} options={ZONAS} /></Field>
          <Field label="Tipo de propiedad"><Select value={prop.tipo} onChange={v=>update('tipo',v)} options={TIPOS} /></Field>
          <Field label="Disposición"><Select value={prop.disposicion} onChange={v=>update('disposicion',v)} options={DISPOSICIONES} /></Field>
          <Field label="Tipo de anunciante"><Select value={prop.anunciante} onChange={v=>update('anunciante',v)} options={ANUNCIANTES} /></Field>
          <Field label="Link al aviso"><TextInput defaultValue={prop.linkAviso} onCommit={v=>update('linkAviso',v)} placeholder="https://..." /></Field>
          <Field label="Inmobiliaria"><TextInput defaultValue={prop.inmobiliaria} onCommit={v=>update('inmobiliaria',v)} /></Field>
          <Field label="Agente"><TextInput defaultValue={prop.agente} onCommit={v=>update('agente',v)} placeholder="Nombre" /></Field>
          <Field label="Teléfono del agente"><TextInput defaultValue={prop.telefonoAgente} onCommit={v=>update('telefonoAgente',v)} placeholder="+54 11 ..." /></Field>
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
                <Field label="Comisión inmobiliaria" hint={`Global: ${analisis.comisionPct}% (editable en Presupuesto)`}>
                  <div style={{ ...iS, background:c.surfaceAlt, color:c.textMuted }}>{analisis.comisionPct}%</div>
                </Field>
                <Field label="Gastos (%)" locked hint="Sellos, escribano, mudanza..."><TextInput type="number" defaultValue={analisis.gastosPct} onCommit={v=>update('gastosPct', v===''?2:v)} /></Field>
              </div>
              {analisis.estado !== 'sin-datos' && (
                <>
                  <div style={{ background:c.surfaceAlt, borderRadius:10, padding:14, marginBottom:12, fontSize:13, lineHeight:1.9 }}>
                    {[
                      ['Precio pedido', fmtUSD(analisis.precio)],
                      [`+ Comisión (${analisis.comisionPct}%)`, fmtUSD(analisis.precio*analisis.comisionPct/100)],
                      [`+ Gastos (${analisis.gastosPct}%)`, fmtUSD(analisis.precio*analisis.gastosPct/100)],
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
      <Section icon={ListChecks} title="Excluyentes" badge={<Badge bg={exCumple===EXCLUYENTES.length?c.greenSoft:c.amberSoft} color={exCumple===EXCLUYENTES.length?c.green:c.amber}>Cumple {exCumple}/{EXCLUYENTES.length}</Badge>} open={sec.excluyentes} onToggle={()=>toggle('excluyentes')}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(210px, 1fr))' }}>
          {EXCLUYENTES.map(e => <Toggle key={e.id} checked={prop.excluyentes?.[e.id]===true} onChange={v=>update(`excluyentes.${e.id}`,v)} label={e.label} />)}
        </div>
      </Section>

      {/* PUNTAJES */}
      {isAdmin && (
        <Section icon={Star} title="Puntajes por criterio" locked preview={`${criterios.length} criterios`} open={sec.puntajes} onToggle={()=>toggle('puntajes')}>
          {/* Automáticos */}
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:11, fontWeight:600, color:c.textMuted, marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${c.border}` }}>
              Automáticos — se calculan solos
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'0 26px' }}>
              {criterios.filter(cr=>cr.tipo==='automatico').map(cr => {
                const val = autoScores[cr.id];
                return (
                  <div key={cr.id} style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ fontSize:13, color:c.textSubtle }}>{cr.label}<span style={{ fontSize:11, marginLeft:6 }}>peso {cr.peso}</span></span>
                      <span style={{ fontSize:13, fontWeight:600, color:val!=null?c.accent:c.textSubtle }}>{val!=null?val:'—'}</span>
                    </div>
                    <input type="range" min={0} max={10} value={val??0} disabled style={{ width:'100%', accentColor:c.accent, opacity:0.4, cursor:'not-allowed' }} />
                    {val==null && <div style={{ fontSize:11, color:c.textSubtle, marginTop:3 }}>Sin datos suficientes — no penaliza</div>}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Manuales */}
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:c.textMuted, marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${c.border}` }}>
              Manuales — completá vos
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'0 26px' }}>
              {criterios.filter(cr=>cr.tipo==='manual').map(cr => <Slider key={cr.id} label={cr.label} weight={cr.peso} value={prop.puntajes?.[cr.id]} onChange={v=>update(`puntajes.${cr.id}`,v)} />)}
            </div>
          </div>
        </Section>
      )}

      {/* DATOS DEL AVISO */}
      <Section icon={Info} title="Datos del aviso" open={sec.aviso} onToggle={()=>toggle('aviso')}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:11 }}>
          <Field label="Fecha de publicación"><TextInput type="date" defaultValue={prop.fechaPublicacion} onCommit={v=>update('fechaPublicacion',v)} /></Field>
          <Field label="Views actuales"><TextInput type="number" defaultValue={prop.views} onCommit={v=>update('views',v)} /></Field>
          <Field label="Cantidad de fotos"><TextInput type="number" defaultValue={prop.cantFotos} onCommit={v=>update('cantFotos',v)} /></Field>
          <Field label="Aviso destacado / premium"><div style={{ paddingTop:4 }}><Toggle checked={prop.destacado} onChange={v=>update('destacado',v)} label={prop.destacado?'Sí':'No'} /></div></Field>
        </div>
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

      {/* ENTORNO */}
      <Section icon={MapPin} title="Entorno" open={sec.entorno} onToggle={()=>toggle('entorno')}>
        {isAdmin && (
          <div style={{ marginBottom:12, padding:12, background:c.surfaceAlt, borderRadius:10, fontSize:12, color:c.textMuted }}>
            Las distancias a lugares de referencia van a calcularse automáticamente con Google Maps (próxima versión).
          </div>
        )}
        <Field label="Escuelas cercanas"><TextArea defaultValue={prop.escuelas} onCommit={v=>update('escuelas',v)} rows={2} /></Field>
        <Field label="Estación tren / subte más cercana"><TextInput defaultValue={prop.transporte} onCommit={v=>update('transporte',v)} /></Field>
        <Field label="Notas del entorno"><TextArea defaultValue={prop.notasEntorno} onCommit={v=>update('notasEntorno',v)} placeholder="Obras cerca, comercios, plazas..." /></Field>
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

const RankingView = ({ propiedades, criterios, presupuesto, config, isAdmin, onSelectProp }) => {
  const ranked = useMemo(() =>
    propiedades.filter(p => p.estado!=='Descartada' && cumpleExcluyentes(p))
      .map(p => ({ ...p, _puntaje:calcularPuntaje(p.puntajes,criterios,p,config), _analisis:calcularAnalisis(p,presupuesto,config?.comisionPct) }))
      .sort((a,b) => b._puntaje - a._puntaje),
    [propiedades, criterios, presupuesto, config]
  );
  const top3 = ranked.slice(0,3);
  const resto = ranked.slice(3);

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'30px 24px 64px' }}>
      <Hero eyebrow={`${ranked.length} ${ranked.length===1?'propiedad evaluada':'propiedades evaluadas'}`} titulo="Ranking" subtitulo="Ordenadas por puntaje ponderado" />
      {ranked.length === 0 ? (
        <Card style={{ textAlign:'center', padding:56, background:c.surfaceAlt }}>
          <Award size={28} style={{ color:c.textMuted, marginBottom:10 }} />
          <h3 style={{ margin:'0 0 7px', fontSize:16, fontWeight:600 }}>No hay propiedades en el ranking</h3>
          <p style={{ margin:0, fontSize:14, color:c.textMuted }}>Agregá puntajes a tus propiedades para verlas aquí.</p>
        </Card>
      ) : (
        <>
          {top3.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${top3.length}, 1fr)`, gap:14, marginBottom:30 }}>
              {top3.map((p, i) => {
                const colA = colorAnalisis(p._analisis.estado);
                const hColor = isAdmin && p._analisis.estado !== 'sin-datos'
                  ? (p._analisis.estado==='rojo'?'#F7C1C1':p._analisis.estado==='amber'?'#FAC775':'#C0DD97')
                  : semaforoBg(p._puntaje);
                return (
                  <Card key={p.id} hoverable onClick={()=>onSelectProp(p.id)}>
                    <div style={{ height:120, background:hColor, position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <ImageIcon size={26} style={{ color:colorPuntaje(p._puntaje), opacity:0.35 }} />
                      <div style={{ position:'absolute', top:10, left:10, width:30, height:30, borderRadius:'50%', background:i===0?c.amber:c.surface, color:i===0?'white':c.text, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14, boxShadow:shadow.sm }}>{i+1}</div>
                      {isAdmin && p.favorita && (
                        <div style={{ position:'absolute', top:10, right:10, width:24, height:24, borderRadius:'50%', background:c.surface, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:shadow.sm }}>
                          <Heart size={11} fill={c.accent} color={c.accent} />
                        </div>
                      )}
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
                return (
                  <div key={p.id} onClick={()=>onSelectProp(p.id)}
                    style={{ padding:'13px 18px', display:'flex', alignItems:'center', gap:13, borderBottom:i<resto.length-1?`1px solid ${c.border}`:'none', cursor:'pointer', transition:'background 150ms' }}
                    onMouseEnter={e=>e.currentTarget.style.background=c.surfaceAlt}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ fontSize:13, color:c.textSubtle, fontWeight:600, width:32 }}>#{i+4}</div>
                    <div style={{ width:40, height:40, borderRadius:9, background:semaforoBg(p._puntaje), display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <ImageIcon size={14} style={{ color:colorPuntaje(p._puntaje), opacity:0.5 }} />
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
    </div>
  );
};

// ============================================================
// DESCARTADAS
// ============================================================

const DescartadasView = ({ propiedades, isAdmin, onRecuperar, onSelectProp }) => {
  const desc = propiedades.filter(p => p.estado==='Descartada' || !cumpleExcluyentes(p));
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
            const motivo = p.estado==='Descartada' ? 'Marcada como descartada' : `No cumple: ${EXCLUYENTES.filter(e=>!p.excluyentes?.[e.id]).map(e=>e.label).join(', ')}`;
            return (
              <div key={p.id} style={{ padding:'15px 18px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, borderBottom:i<desc.length-1?`1px solid ${c.border}`:'none' }}>
                <div style={{ flex:1, cursor:'pointer', minWidth:0 }} onClick={()=>onSelectProp(p.id)}>
                  <div style={{ fontWeight:600, marginBottom:3, fontSize:14 }}>{p.nombre||'Sin nombre'}</div>
                  <div style={{ fontSize:12, color:c.textMuted, marginBottom:5 }}>{p.zona} · {fmtUSD(p.precioPedido)}</div>
                  <div style={{ fontSize:12, color:c.red, display:'flex', alignItems:'center', gap:4 }}><AlertCircle size={11} /> {motivo}</div>
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

      <div style={{ marginBottom:16, padding:14, background:c.surfaceAlt, border:`1px solid ${c.border}`, borderRadius:12, fontSize:12, color:c.textMuted, lineHeight:1.7 }}>
        <strong style={{ color:c.text }}>Criterios automáticos</strong> (zona deseada, cochera, distancias): se calculan solos según los datos de cada propiedad y tu configuración. Solo podés ajustar su <em>peso</em> relativo.<br/>
        <strong style={{ color:c.text }}>Criterios manuales</strong>: los puntuás vos del 0 al 10 en cada propiedad.
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

const PresupuestoView = ({ presupuesto, setPresupuesto, config, setConfig }) => {
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

      {/* Comisión editable — acá hasta que exista sección Configuración */}
      <Card style={{ padding:24 }}>
        <h3 style={{ margin:'0 0 6px', fontSize:15, fontWeight:600 }}>Parámetros de compra</h3>
        <p style={{ margin:'0 0 16px', fontSize:12, color:c.textMuted }}>Afectan el análisis de compra de todas las propiedades</p>
        <Field label="Comisión inmobiliaria (%)" hint="Valor estándar en Argentina: 4%">
          <TextInput
            type="number"
            defaultValue={config?.comisionPct ?? 4}
            onCommit={v => setConfig(cfg => ({ ...cfg, comisionPct: v===''?4:parseFloat(v) }))}
          />
        </Field>
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
  const [config, setConfig] = useState({ comisionPct:4, barriosDeseados:[], lugaresReferencia:[] });
  const [usuarios, setUsuarios] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filtros, setFiltros] = useState({ zona:'', estado:'', busqueda:'', soloFavoritas:false });
  const [showGestion, setShowGestion] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);

  const isAdmin = userDoc?.rol === 'admin' && userDoc?.estado === 'aprobado';
  const isApproved = userDoc?.estado === 'aprobado';

  // 1. Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userRef = doc(db, 'usuarios', user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          const esSuperAdmin = user.email === SUPER_ADMIN_EMAIL;
          const nuevoDoc = {
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            rol: esSuperAdmin ? 'admin' : 'invitado',
            estado: esSuperAdmin ? 'aprobado' : 'pendiente',
            createdAt: new Date().toISOString(),
          };
          await setDoc(userRef, nuevoDoc);
          setUserDoc({ id: user.uid, ...nuevoDoc });
        } else {
          setUserDoc({ id: user.uid, ...snap.data() });
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
    if (!isApproved) return;
    setDataLoading(true);
    const unsubs = [];

    unsubs.push(onSnapshot(collection(db, 'propiedades'), (snap) => {
      setPropiedades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));

    unsubs.push(onSnapshot(doc(db, 'config', 'main'), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.criterios) {
          // Si los criterios guardados no tienen campo 'tipo', son del sistema viejo → migrar
          const necesitaMigrar = data.criterios.some(cr => !cr.tipo);
          if (necesitaMigrar && isAdmin) {
            // Guardar los nuevos defaults en Firestore y usarlos
            await updateDoc(doc(db, 'config', 'main'), { criterios: CRITERIOS_DEFAULT });
            setCriterios(CRITERIOS_DEFAULT);
          } else {
            setCriterios(data.criterios);
          }
        }
        if (data.presupuesto) setPresupuesto(data.presupuesto);
        if (data.configuracion) setConfig(data.configuracion);
      } else {
        if (isAdmin) {
          await setDoc(doc(db, 'config', 'main'), {
            criterios: CRITERIOS_DEFAULT,
            presupuesto: { ventaMin:167000, ventaMax:185000, ahorros:45000, aportes:70000, objetivo:250000 },
            configuracion: { comisionPct:4, barriosDeseados:[], lugaresReferencia:[] },
          });
        }
      }
      setDataLoading(false);
    }));

    if (isAdmin) {
      unsubs.push(onSnapshot(collection(db, 'usuarios'), (snap) => {
        setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }));
    }

    return () => unsubs.forEach(u => u());
  }, [isApproved, isAdmin]);

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

  // Usuarios handlers
  const onAprobarUsuario = async (uid, rol) => {
    await updateDoc(doc(db, 'usuarios', uid), { estado: 'aprobado', rol });
  };
  const onRechazarUsuario = async (uid) => {
    if (!confirm('¿Rechazar a este usuario? No va a poder entrar.')) return;
    await deleteDoc(doc(db, 'usuarios', uid));
  };
  const onCambiarRol = async (uid, rol) => {
    await updateDoc(doc(db, 'usuarios', uid), { rol });
  };
  const onEliminarUsuario = async (uid) => {
    if (!confirm('¿Eliminar este usuario? Pierde el acceso.')) return;
    await deleteDoc(doc(db, 'usuarios', uid));
  };

  // Propiedades handlers
  const onNuevaProp = useCallback(async () => {
    const nueva = { nombre:'Nueva propiedad', estado:'Para visitar', excluyentes:{}, puntajes:{}, favorita:false, gastosPct:2, createdAt: new Date().toISOString() };
    const ref = await addDoc(collection(db, 'propiedades'), nueva);
    setSelectedId(ref.id);
  }, []);

  const onDelete = useCallback(async () => {
    if (!confirm('¿Eliminar esta propiedad?')) return;
    await deleteDoc(doc(db, 'propiedades', selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const setPropActual = useCallback(async (updater) => {
    const prop = propiedades.find(p => p.id === selectedId);
    if (!prop) return;
    const nuevoProp = typeof updater === 'function' ? updater(prop) : updater;
    const { id, ...data } = nuevoProp;
    await updateDoc(doc(db, 'propiedades', selectedId), data);
  }, [selectedId, propiedades]);

  const onRecuperar = useCallback(async (id) => {
    await updateDoc(doc(db, 'propiedades', id), { estado: 'Para visitar' });
  }, []);

  // Config/criterios/presupuesto handlers (guardan en Firestore)
  const setCriteriosFirestore = useCallback(async (updater) => {
    const nuevos = typeof updater === 'function' ? updater(criterios) : updater;
    setCriterios(nuevos);
    await updateDoc(doc(db, 'config', 'main'), { criterios: nuevos });
  }, [criterios]);

  const setPresupuestoFirestore = useCallback(async (updater) => {
    const nuevo = typeof updater === 'function' ? updater(presupuesto) : updater;
    setPresupuesto(nuevo);
    await updateDoc(doc(db, 'config', 'main'), { presupuesto: nuevo });
  }, [presupuesto]);

  const setConfigFirestore = useCallback(async (updater) => {
    const nuevo = typeof updater === 'function' ? updater(config) : updater;
    setConfig(nuevo);
    await updateDoc(doc(db, 'config', 'main'), { configuracion: nuevo });
  }, [config]);

  useEffect(() => { if (!isAdmin && view === 'presupuesto') setView('lista'); }, [isAdmin, view]);

  // === RENDER ===

  if (authLoading) return <LoadingScreen mensaje="Verificando sesión..." />;
  if (!firebaseUser) return <LoginScreen onLogin={handleLogin} error={loginError} />;
  if (!isApproved) return <WaitingScreen user={firebaseUser} onLogout={handleLogout} />;
  if (dataLoading) return <LoadingScreen mensaje="Cargando datos..." />;

  const propActual = propiedades.find(p => p.id === selectedId);
  const pendientes = usuarios.filter(u => u.estado === 'pendiente').length;

  return (
    <div style={{ minHeight:'100vh', background:c.bg, fontFamily:FONT, color:c.text }}>
      <NavBar
        view={view}
        setView={v => { setView(v); setSelectedId(null); }}
        currentUser={firebaseUser}
        isAdmin={isAdmin}
        propiedades={propiedades}
        pendientes={pendientes}
        onLogout={handleLogout}
        onAbrirGestionUsuarios={() => setShowGestion(true)}
      />

      {showGestion && (
        <GestionUsuariosModal
          usuarios={usuarios}
          currentUser={firebaseUser}
          onAprobar={onAprobarUsuario}
          onRechazar={onRechazarUsuario}
          onCambiarRol={onCambiarRol}
          onEliminar={onEliminarUsuario}
          onClose={() => setShowGestion(false)}
        />
      )}

      {selectedId && propActual ? (
        <DetalleView
          prop={propActual}
          setProp={setPropActual}
          criterios={criterios}
          presupuesto={presupuesto}
          config={config}
          isAdmin={isAdmin}
          onBack={() => setSelectedId(null)}
          onDelete={onDelete}
        />
      ) : (
        <>
          {view === 'lista' && <ListaView propiedades={propiedades} criterios={criterios} presupuesto={presupuesto} config={config} isAdmin={isAdmin} filtros={filtros} setFiltros={setFiltros} onSelectProp={setSelectedId} onNuevaProp={onNuevaProp} />}
          {view === 'ranking' && <RankingView propiedades={propiedades} criterios={criterios} presupuesto={presupuesto} config={config} isAdmin={isAdmin} onSelectProp={setSelectedId} />}
          {view === 'descartadas' && <DescartadasView propiedades={propiedades} isAdmin={isAdmin} onRecuperar={onRecuperar} onSelectProp={setSelectedId} />}
          {view === 'pesos' && <PesosView criterios={criterios} setCriterios={setCriteriosFirestore} isAdmin={isAdmin} />}
          {view === 'presupuesto' && (isAdmin ? <PresupuestoView presupuesto={presupuesto} setPresupuesto={setPresupuestoFirestore} config={config} setConfig={setConfigFirestore} /> : <AccesoDenegadoView />)}
        </>
      )}
    </div>
  );
}
