import { PrismaClient, Role, VehicleType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // 1. Seed Passengers
  const passenger1 = await prisma.user.upsert({
    where: { email: 'alice.passenger@uberlite.local' },
    update: {},
    create: {
      email: 'alice.passenger@uberlite.local',
      name: 'Alice Johnson',
      password: 'hashed_password_123',
      phone: '+919876543210',
      role: Role.PASSENGER,
    },
  });

  const passenger2 = await prisma.user.upsert({
    where: { email: 'bob.passenger@uberlite.local' },
    update: {},
    create: {
      email: 'bob.passenger@uberlite.local',
      name: 'Bob Smith',
      password: 'hashed_password_456',
      phone: '+919876543211',
      role: Role.PASSENGER,
    },
  });

  console.log(`Seeded passengers: ${passenger1.name}, ${passenger2.name}`);

  // 2. Seed Drivers with vehicles and locations
  const driverUser1 = await prisma.user.upsert({
    where: { email: 'rajesh.driver@uberlite.local' },
    update: {},
    create: {
      email: 'rajesh.driver@uberlite.local',
      name: 'Rajesh Kumar',
      password: 'hashed_password_789',
      phone: '+919876543220',
      role: Role.DRIVER,
    },
  });

  const driver1 = await prisma.driver.upsert({
    where: { userId: driverUser1.id },
    update: {
      isAvailable: true,
      currentLat: 28.6139,
      currentLng: 77.209,
    },
    create: {
      userId: driverUser1.id,
      licenseNumber: 'DL-04-2021-0012345',
      vehicleType: VehicleType.STANDARD,
      vehicleModel: 'Maruti Suzuki Dzire',
      vehiclePlate: 'DL-1CAB-1024',
      vehicleColor: 'White',
      isAvailable: true,
      currentLat: 28.6139,
      currentLng: 77.209,
      rating: 4.85,
    },
  });

  const driverUser2 = await prisma.user.upsert({
    where: { email: 'vikram.driver@uberlite.local' },
    update: {},
    create: {
      email: 'vikram.driver@uberlite.local',
      name: 'Vikram Singh',
      password: 'hashed_password_101',
      phone: '+919876543221',
      role: Role.DRIVER,
    },
  });

  const driver2 = await prisma.driver.upsert({
    where: { userId: driverUser2.id },
    update: {
      isAvailable: true,
      currentLat: 28.6289,
      currentLng: 77.2065,
    },
    create: {
      userId: driverUser2.id,
      licenseNumber: 'DL-04-2020-0098765',
      vehicleType: VehicleType.PREMIUM,
      vehicleModel: 'Honda City',
      vehiclePlate: 'DL-2CAB-5678',
      vehicleColor: 'Silver',
      isAvailable: true,
      currentLat: 28.6289,
      currentLng: 77.2065,
      rating: 4.95,
    },
  });

  const driverUser3 = await prisma.user.upsert({
    where: { email: 'amit.driver@uberlite.local' },
    update: {},
    create: {
      email: 'amit.driver@uberlite.local',
      name: 'Amit Sharma',
      password: 'hashed_password_202',
      phone: '+919876543222',
      role: Role.DRIVER,
    },
  });

  const driver3 = await prisma.driver.upsert({
    where: { userId: driverUser3.id },
    update: {
      isAvailable: false,
      currentLat: 28.6353,
      currentLng: 77.225,
    },
    create: {
      userId: driverUser3.id,
      licenseNumber: 'DL-04-2019-0054321',
      vehicleType: VehicleType.XL,
      vehicleModel: 'Toyota Innova Crysta',
      vehiclePlate: 'DL-3CAB-9900',
      vehicleColor: 'Grey',
      isAvailable: false,
      currentLat: 28.6353,
      currentLng: 77.225,
      rating: 4.78,
    },
  });

  console.log(`Seeded drivers: ${driverUser1.name}, ${driverUser2.name}, ${driverUser3.name}`);
  console.log('Database seed finished successfully.');
}

main()
  .catch((e) => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
