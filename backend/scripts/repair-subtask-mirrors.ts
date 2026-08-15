/**
 * Close the mirror tasks that were left open when their subtask was ticked.
 *
 * A subtask assigned to somebody is written twice: once as a Subtask, and once as a
 * Task of type SUBTASK linked through subtaskId, so it lands on that person's board.
 * Ticking the subtask only ever updated the Subtask. The mirror stayed open forever,
 * so a task showing 5 of 5 subtasks complete still had five rows counted as open, and
 * as many days overdue as had passed since its due date.
 *
 * That is fixed at the source now. This repairs the rows stranded before the fix.
 *
 * Run once:  npx ts-node scripts/repair-subtask-mirrors.ts
 *            npx ts-node scripts/repair-subtask-mirrors.ts --apply
 *
 * Without --apply it only reports, so the damage can be seen before anything is
 * written. Idempotent either way: a second run finds nothing, because every row it
 * touched no longer matches.
 *
 * Deliberately a script and not a migration. Production applies migrations on boot,
 * and a repair walking every task in every company would hold the boot open and time
 * the deploy out.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  // Completed subtasks whose mirror task is still open. Both halves of the
  // disagreement are in the where clause, so this cannot match a row that is fine.
  const stranded = await prisma.subtask.findMany({
    where: {
      isCompleted: true,
      linkedTask: { is: { completedAt: null } },
    },
    select: {
      id: true,
      title: true,
      completedAt: true,
      linkedTask: {
        select: { id: true, title: true, workflowId: true, dueDate: true },
      },
    },
  });

  if (stranded.length === 0) {
    console.log('Nothing stranded. Every completed subtask has a closed mirror task.');
    return;
  }

  console.log(`${stranded.length} completed ${stranded.length === 1 ? 'subtask has' : 'subtasks have'} a mirror task still open:\n`);

  // One lookup per workflow rather than one per row: these rows cluster heavily into a
  // handful of workflows, and the end phase is the same for all of them.
  const endPhaseByWorkflow = new Map<string, string | null>();
  const endPhaseFor = async (workflowId: string | null) => {
    if (!workflowId) return null;
    if (!endPhaseByWorkflow.has(workflowId)) {
      const phase = await prisma.phase.findFirst({
        where: { workflowId, isEndPhase: true },
        select: { id: true },
      });
      endPhaseByWorkflow.set(workflowId, phase?.id ?? null);
    }
    return endPhaseByWorkflow.get(workflowId) ?? null;
  };

  let repaired = 0;

  for (const subtask of stranded) {
    const mirror = subtask.linkedTask;
    if (!mirror) continue;

    const overdueBy = mirror.dueDate
      ? Math.floor((Date.now() - mirror.dueDate.getTime()) / 86_400_000)
      : null;

    console.log(
      `  ${mirror.title.slice(0, 70)}` +
        (overdueBy && overdueBy > 0 ? `  [counted ${overdueBy} days overdue]` : ''),
    );

    if (apply) {
      const endPhaseId = await endPhaseFor(mirror.workflowId);
      await prisma.task.update({
        where: { id: mirror.id },
        data: {
          // The subtask's own completion time, not now. These were finished when they
          // were finished, and stamping today would put months of work into this week
          // on every chart that reads completedAt.
          completedAt: subtask.completedAt ?? new Date(),
          phase: 'COMPLETED' as any,
          ...(endPhaseId ? { currentPhaseId: endPhaseId } : {}),
        },
      });
      repaired += 1;
    }
  }

  console.log('');
  if (apply) {
    console.log(`Repaired ${repaired}. Re-run without --apply to confirm nothing is left.`);
  } else {
    console.log('Nothing was written. Re-run with --apply to close these.');
  }
}

main()
  .catch((error) => {
    console.error('Repair failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
