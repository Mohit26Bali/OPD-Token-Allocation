/**
 * Thin CLI entrypoint for the "Demo OPD Day" simulation. All the actual
 * scenario logic and allocation decisions come from the backend's own
 * simulationService, which drives the SAME tokenService/emergencyService/
 * doctorService/slotService functions the REST API uses — this file only
 * triggers the run and writes the resulting report to disk.
 */
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type * as SimulationServiceModule from '../backend/src/services/simulationService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

const { runDemoDaySimulation } = (await import('../backend/src/services/simulationService.js')) as typeof SimulationServiceModule;
const { prisma } = await import('../backend/src/utils/prisma.js');

function toMarkdown(run: Awaited<ReturnType<typeof runDemoDaySimulation>>): string {
  const lines: string[] = [];
  lines.push(`# Demo OPD Day — Simulation Report`);
  lines.push('');
  lines.push(`Run ID: \`${run.id}\``);
  lines.push(`Started: ${run.startedAt}`);
  lines.push(`Finished: ${run.finishedAt}`);
  lines.push('');
  lines.push('## Event Timeline');
  lines.push('');
  for (const e of run.timeline) {
    const time = new Date(e.simulatedTime).toTimeString().slice(0, 5);
    lines.push(`- **${time}** [${e.kind}] ${e.label}${e.detail ? ` — ${e.detail}` : ''}`);
  }
  lines.push('');
  lines.push('## Doctor Utilization');
  lines.push('');
  lines.push('| Doctor | Specialization | Capacity | Occupied | Utilization |');
  lines.push('|---|---|---|---|---|');
  for (const d of run.metrics.doctors) {
    lines.push(`| ${d.name} | ${d.specialization} | ${d.capacity} | ${d.occupied} | ${d.utilizationPct}% |`);
  }
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push(`- Average wait time: ${run.metrics.averageWaitMinutes} min`);
  lines.push(`- Maximum wait time: ${run.metrics.maxWaitMinutes} min`);
  lines.push(`- Emergency insertions: ${run.metrics.emergencyInsertions}`);
  lines.push(`- Reallocations: ${run.metrics.reallocations}`);
  lines.push(`- Cancellations: ${run.metrics.cancellations}`);
  lines.push(`- No-shows: ${run.metrics.noShows}`);
  lines.push(`- Still waiting / rejected at end of run: ${run.metrics.rejectedOrHeldWaiting}`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const run = await runDemoDaySimulation();
  const reportsDir = path.join(__dirname, 'reports');
  writeFileSync(path.join(reportsDir, 'demoDay.json'), JSON.stringify(run, null, 2));
  writeFileSync(path.join(reportsDir, 'demoDay.md'), toMarkdown(run));
  console.log(`Simulation run ${run.id} complete.`);
  console.log(`Reports written to ${reportsDir}`);
  console.log(JSON.stringify(run.metrics, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
