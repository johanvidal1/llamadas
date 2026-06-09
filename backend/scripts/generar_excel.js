const XLSX = require('xlsx')
const path = require('path')

const operadores = ['Movistar', 'Claro', 'Telmex', 'AT&T', 'Nextel', 'Virgin Mobile', 'Bait', 'Flash Mobile']
const planes = ['Paquete 150', 'Paquete 250', 'Paquete 400', 'Plan Básico 99', 'Plan Familiar 350', 'Plan Ilimitado 500', 'Prepago', 'Control 200']
const nombres = [
  'María García', 'Juan Rodríguez', 'Ana Martínez', 'Carlos López', 'Laura Sánchez',
  'Pedro Hernández', 'Sofia Torres', 'Miguel González', 'Elena Ramírez', 'Luis Flores',
  'Carmen Díaz', 'Roberto Jiménez', 'Patricia Morales', 'Fernando Ruiz', 'Isabel Vargas',
  'Alejandro Cruz', 'Valentina Reyes', 'Eduardo Mendoza', 'Gabriela Castillo', 'Ricardo Romero',
  'Daniela Vega', 'Arturo Herrera', 'Natalia Guerrero', 'Sergio Medina', 'Claudia Ríos',
  'Marcos Ortega', 'Verónica Delgado', 'Andrés Aguilar', 'Lorena Molina', 'Héctor Gutiérrez',
  'Paola Navarro', 'Óscar Ramos', 'Sandra Álvarez', 'Javier Domínguez', 'Rocío Peña',
  'Ernesto Suárez', 'Adriana Mora', 'Gonzalo Ibáñez', 'Beatriz Paredes', 'Tomás Acosta',
]
const colonias = [
  'Col. Centro', 'Col. Del Valle', 'Col. Polanco', 'Col. Narvarte', 'Col. Roma Norte',
  'Col. Condesa', 'Col. Doctores', 'Col. Lindavista', 'Col. Coyoacán', 'Col. Pedregal',
]
const notas = [
  'Contrato vence en agosto', 'Molesto con su operador actual', 'Interesado en portabilidad',
  'Llamar solo por la mañana', 'Tiene familia, busca plan grupal', '', '', '', '', '',
]

function randomPhone() {
  const area = ['55', '81', '33', '56', '664', '477', '449', '444'][Math.floor(Math.random() * 8)]
  const num = Math.floor(Math.random() * 90000000) + 10000000
  return `${area}${num}`.slice(0, 10)
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const clientes = nombres.map((nombre, i) => ({
  nombre,
  telefono: randomPhone(),
  telefono2: Math.random() > 0.6 ? randomPhone() : '',
  email: `${nombre.toLowerCase().replace(/ /g, '.').normalize('NFD').replace(/[\u0300-\u036f]/g, '')}${i + 1}@gmail.com`,
  direccion: `Calle ${pick(['Reforma', 'Insurgentes', 'Juárez', 'Hidalgo', 'Morelos'])} #${Math.floor(Math.random() * 900) + 100}, ${pick(colonias)}`,
  operador: pick(operadores),
  plan: pick(planes),
  notas: pick(notas),
}))

const ws = XLSX.utils.json_to_sheet(clientes)

// Set column widths
ws['!cols'] = [
  { wch: 22 }, // nombre
  { wch: 13 }, // telefono
  { wch: 13 }, // telefono2
  { wch: 38 }, // email
  { wch: 40 }, // direccion
  { wch: 15 }, // operador
  { wch: 20 }, // plan
  { wch: 35 }, // notas
]

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Clientes')

const outputPath = path.join(__dirname, '..', 'clientes_prueba_40.xlsx')
XLSX.writeFile(wb, outputPath)
console.log(`✅ Archivo generado: ${outputPath}`)
console.log(`   40 clientes listos para importar`)
