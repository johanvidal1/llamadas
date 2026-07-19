import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma'
import { ensureArchivedAgent } from './lib/archivedAgent'
import { OPTICK_TENANT_ID, OPTICK_TENANT_NAME, OPTICK_TENANT_SLUG } from './lib/tenant'
import { runWithTenant } from './lib/tenantContext'

async function ensureOptickTenant() {
  await prisma.tenant.upsert({
    where: { slug: OPTICK_TENANT_SLUG },
    create: {
      id: OPTICK_TENANT_ID,
      name: OPTICK_TENANT_NAME,
      slug: OPTICK_TENANT_SLUG,
      status: 'ACTIVE',
    },
    update: {},
  })
}

async function seedDefaultAdmin() {
  console.log('🌱 Creando usuario administrador...')

  const existing = await prisma.user.findFirst({
    where: { email: 'admin@llamadas.com' },
  })

  if (existing) {
    console.log('✅ El admin ya existe:', existing.email)
    return
  }

  const password = await bcrypt.hash('Admin123!', 12)
  const admin = await prisma.user.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      name: 'Administrador',
      email: 'admin@llamadas.com',
      password,
      role: 'ADMIN',
      isSuperAdmin: true,
      isSystemOwner: false,
    },
  })

  console.log('✅ Admin creado:')
  console.log('   Email:', admin.email)
  console.log('   Contraseña: Admin123!')
  console.log('   ⚠️  Cambia la contraseña después del primer inicio de sesión')
}

async function seedSystemOwner() {
  const email = process.env.SYSTEM_OWNER_EMAIL?.trim().toLowerCase()
  if (!email) {
    console.log('ℹ️  SYSTEM_OWNER_EMAIL no definido — omitiendo propietario del sistema')
    return
  }

  console.log('🌱 Configurando propietario del sistema...')

  await prisma.user.updateMany({
    where: { isSystemOwner: true, email: { not: email } },
    data: { isSystemOwner: false },
  })

  const existing = await prisma.user.findFirst({ where: { email } })

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'ADMIN',
        isSuperAdmin: true,
        isSystemOwner: true,
      },
    })
    console.log('✅ Propietario del sistema promovido:', email)
    return
  }

  const passwordPlain = process.env.SYSTEM_OWNER_PASSWORD
  if (!passwordPlain) {
    throw new Error(
      'SYSTEM_OWNER_PASSWORD es requerido para crear un nuevo propietario del sistema'
    )
  }

  const password = await bcrypt.hash(passwordPlain, 12)
  const owner = await prisma.user.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      name: 'System Owner',
      email,
      password,
      role: 'ADMIN',
      isSuperAdmin: true,
      isSystemOwner: true,
    },
  })

  console.log('✅ Propietario del sistema creado:', owner.email)
}

async function main() {
  await ensureOptickTenant()
  await seedDefaultAdmin()
  await seedSystemOwner()
  await ensureArchivedAgent()
  console.log('✅ Agente comodín (Agente borrado) verificado')
}

runWithTenant(OPTICK_TENANT_ID, () => main())
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
