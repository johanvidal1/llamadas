import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from './lib/prisma'

async function main() {
  console.log('🌱 Creando usuario administrador...')

  const existing = await prisma.user.findUnique({
    where: { email: 'admin@llamadas.com' },
  })

  if (existing) {
    console.log('✅ El admin ya existe:', existing.email)
    return
  }

  const password = await bcrypt.hash('Admin123!', 12)
  const admin = await prisma.user.create({
    data: {
      name: 'Administrador',
      email: 'admin@llamadas.com',
      password,
      role: 'ADMIN',
    },
  })

  console.log('✅ Admin creado:')
  console.log('   Email:', admin.email)
  console.log('   Contraseña: Admin123!')
  console.log('   ⚠️  Cambia la contraseña después del primer inicio de sesión')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
