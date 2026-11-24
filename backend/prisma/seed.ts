import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function todayAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  await prisma.allocationEvent.deleteMany();
  await prisma.token.deleteMany();
  await prisma.opdSlot.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.doctor.deleteMany();

  const sharma = await prisma.doctor.create({
    data: { name: 'Dr. Sharma', specialization: 'Cardiology' },
  });
  const patel = await prisma.doctor.create({
    data: { name: 'Dr. Patel', specialization: 'General Medicine' },
  });
  const rao = await prisma.doctor.create({
    data: { name: 'Dr. Rao', specialization: 'Orthopedics' },
  });

  const slotWindows: [number, number][] = [
    [9, 10],
    [10, 11],
    [11, 12],
    [12, 13],
  ];

  const doctors = [sharma, patel, rao];
  const slotsByDoctor: Record<string, string[]> = {};

  for (const doctor of doctors) {
    slotsByDoctor[doctor.id] = [];
    for (const [start, end] of slotWindows) {
      const slot = await prisma.opdSlot.create({
        data: {
          doctorId: doctor.id,
          date: new Date(new Date().toDateString()),
          startTime: todayAt(start),
          endTime: todayAt(end),
          maximumCapacity: 10,
          emergencyReserve: 1,
          paidReserve: 1,
          status: 'OPEN',
        },
      });
      slotsByDoctor[doctor.id].push(slot.id);
    }
  }

  const patientNames = [
    'Rahul Verma', 'Anita Singh', 'Vikram Shah', 'Priya Nair', 'Suresh Kumar',
    'Meena Iyer', 'Arjun Reddy', 'Kavita Joshi', 'Ravi Menon', 'Sneha Gupta',
  ];
  const patients = [];
  for (const name of patientNames) {
    patients.push(await prisma.patient.create({ data: { name } }));
  }

  const sources: Array<'ONLINE' | 'WALK_IN' | 'PAID_PRIORITY' | 'FOLLOW_UP'> = [
    'ONLINE', 'WALK_IN', 'PAID_PRIORITY', 'FOLLOW_UP', 'ONLINE', 'WALK_IN', 'ONLINE', 'FOLLOW_UP', 'WALK_IN', 'PAID_PRIORITY',
  ];
  const basePriority: Record<string, number> = {
    EMERGENCY: 100, PAID_PRIORITY: 80, FOLLOW_UP: 60, ONLINE: 40, WALK_IN: 20,
  };

  let counter = 1;
  for (let i = 0; i < patients.length; i++) {
    const doctor = doctors[i % doctors.length];
    const slotId = slotsByDoctor[doctor.id][0];
    const source = sources[i];
    const prefix = source === 'PAID_PRIORITY' ? 'P' : source === 'FOLLOW_UP' ? 'F' : 'A';
    const tokenNumber = `${prefix}${String(counter++).padStart(3, '0')}`;
    const token = await prisma.token.create({
      data: {
        patientId: patients[i].id,
        doctorId: doctor.id,
        slotId,
        tokenNumber,
        source,
        status: 'ALLOCATED',
        priorityScoreAtIntake: basePriority[source],
        allocatedAt: new Date(),
      },
    });
    await prisma.allocationEvent.create({
      data: {
        type: 'TOKEN_ALLOCATED',
        tokenId: token.id,
        slotId,
        doctorId: doctor.id,
        reason: `Seed data: allocated on intake, source=${source}, base priority=${basePriority[source]}.`,
        payload: { source, tokenNumber },
      },
    });
  }

  console.log('Seed complete:', { doctors: doctors.length, patients: patients.length, tokens: patients.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
