import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'demo@filitech.dev' } });
  console.log('Demo user:', user ? 'EXISTS' : 'NOT FOUND');
  if (user) console.log('Role:', user.role, 'Tenant:', user.tenantId);

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'demo' } });
  console.log('Demo tenant:', tenant ? 'EXISTS' : 'NOT FOUND');

  const modules = await prisma.module.findMany({ where: { active: true } });
  console.log('Modules:', modules.map(m => m.code).join(', '));

  const niches = await prisma.niche.findMany({ where: { active: true } });
  console.log('Nichos:', niches.map(n => n.code).join(', '));
}

main().catch(console.error).finally(() => prisma.$disconnect());