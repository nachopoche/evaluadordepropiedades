const { onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const anthropicKey = defineSecret('ANTHROPIC_API_KEY');

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

const SYSTEM_PROMPT = `Sos un extractor de datos de avisos inmobiliarios de Argentina (Zonaprop, Argenprop, MercadoLibre). Recibís el texto pegado de un aviso y devolvés ÚNICAMENTE un objeto JSON válido: sin markdown, sin backticks, sin texto antes ni después.

Reglas:
- Incluí solo los campos que encontrás con certeza en el texto. Si un dato no está, omití la clave. NUNCA inventes valores.
- "expensas" SIEMPRE en pesos argentinos (ARS), nunca en dólares, aunque el precio esté en USD.
- "precioPedido" en USD, solo el número sin símbolo ni puntos.
- Si el aviso da metros totales y cubiertos: m2Descubiertos = total − cubiertos. Si solo hay uno, completá el que corresponda.
- "tipo" debe ser exactamente uno de: PH, Casa, Departamento, Otro. Usá el dato del encabezado estructurado, NO el título de marketing. Si el encabezado dice "Departamento" y el título dice "Triplex", tipo = Departamento.
- "subtipo" puede tomar el valor del título si es uno de: Triplex, Dúplex, Semipiso, Piso, Monoambiente, Loft, Penthouse.
- "zona" debe coincidir EXACTAMENTE con uno de estos barrios: ${JSON.stringify(ZONAS)}. Si el aviso dice "Saavedra, Capital Federal", devolvé "Saavedra". Si no matchea ninguno, omití el campo.
- "disposicion" debe ser uno de: Frente, Contrafrente, Interior, Lateral.
- "orientacion" debe ser uno de: N, S, E, O, NE, NO, SE, SO.
- "anunciante": "Inmobiliaria" si hay una agencia, "Dueño directo" si lo vende el propietario.
- "inmobiliaria": nombre de la agencia si aparece (ej: HABITART).
- "diasPublicado": si dice "Publicado hace N días", devolvé N como número entero.
- "cochera": true solo si menciona cochera o garage explícitamente.
- "excluyentes": objeto con SOLO las claves que el texto mencione de forma explícita y objetiva. Solo estas tres: terraza (terraza propia o balcón-terraza), ascensor (edificio con ascensor), gasNatural (calefacción a gas natural). NO infieras luminoso, cocinaAmplia, listoVivir ni expensasBajas.
- "comodidades": objeto con SOLO las comodidades mencionadas explícitamente. Claves válidas: balcon, terraza, patio, jardin, pileta, quincho, solarium, lavadero, parrilla, baulera, vestidor, dependencia, toilette, banoSuite, sum, gimnasio, ascensor, laundry.

Devolvé el JSON con exactamente esta estructura (omitiendo las claves que no encontrás):
{
  "nombre": "string",
  "direccion": "string",
  "zona": "string",
  "tipo": "string",
  "subtipo": "string",
  "disposicion": "string",
  "orientacion": "string",
  "ambientes": 0,
  "dormitorios": 0,
  "banos": 0,
  "m2Cubiertos": 0,
  "m2Descubiertos": 0,
  "antiguedad": 0,
  "piso": 0,
  "cochera": false,
  "precioPedido": 0,
  "expensas": 0,
  "anunciante": "string",
  "inmobiliaria": "string",
  "diasPublicado": 0,
  "excluyentes": { "terraza": false, "ascensor": false, "gasNatural": false },
  "comodidades": { "balcon": false, "terraza": false, "patio": false, "jardin": false, "pileta": false, "quincho": false, "solarium": false, "lavadero": false, "parrilla": false, "baulera": false, "vestidor": false, "dependencia": false, "toilette": false, "banoSuite": false, "sum": false, "gimnasio": false, "ascensor": false, "laundry": false }
}`;

exports.parsearAviso = onCall(
  { secrets: [anthropicKey], cors: true },
  async (request) => {
    const { texto } = request.data;
    if (!texto || !texto.trim()) {
      throw new Error('Se requiere el texto del aviso.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey.value(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: texto }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Error Anthropic API ${response.status}: ${err}`);
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '{}';
    // Limpiar backticks por las dudas
    const clean = raw.replace(/```json\n?|```\n?/g, '').trim();

    try {
      return JSON.parse(clean);
    } catch {
      throw new Error('La IA devolvió un formato inesperado. Intentá de nuevo.');
    }
  }
);
