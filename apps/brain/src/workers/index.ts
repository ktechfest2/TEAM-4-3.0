import { PgBoss } from "pg-boss";
import { QUEUES, type AlertCaseJob, type AlertGoNowJob, type AlertNoticeJob, type AlertTransferJob, type CaseAggregateJob, type CaseOverrideJob, type CaseVerifyJob, type DialJob, type WebhookJob } from "@confam/db";
import type { AppDeps, JobQueue } from "../context.ts";
import { handleAlertGoNow, handleAlertNotice, handleAlertTransfer } from "./alerts.ts";
import { handleAlertCase, handleCaseAggregate, handleCaseVerify, overrideVerdict } from "./cases.ts";
import { handleDial } from "./dial.ts";
import { handleSweepLateness } from "./sweep.ts";
import { handleWebhook } from "./webhook.ts";

export async function startBoss(connectionString: string): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString, schema: "pgboss" });
  await boss.start();
  for (const name of Object.values(QUEUES)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name);
  }
  return boss;
}

export function bossQueue(boss: PgBoss): JobQueue {
  return {
    send: (name, data, options) => boss.send(name, data, options as never),
  };
}

class RetryableJobError extends Error {}

/** Registers every worker. Each handler processes one job at a time; failures are retried by pg-boss per send options. */
export async function startWorkers(boss: PgBoss, deps: AppDeps): Promise<void> {
  const one = <T>(name: string, fn: (data: T) => Promise<unknown>) =>
    boss.work<T>(name, { batchSize: 1, pollingIntervalSeconds: 1 }, async (jobs) => {
      for (const job of jobs) {
        try {
          await fn(job.data);
        } catch (err) {
          deps.log.error({ err, queue: name, jobId: job.id }, "job failed");
          throw err;
        }
      }
    });

  await one<CaseVerifyJob>(QUEUES.caseVerify, (d) => handleCaseVerify(deps, d));
  await one<CaseAggregateJob>(QUEUES.caseAggregate, (d) => handleCaseAggregate(deps, d));
  await one<CaseOverrideJob>(QUEUES.caseOverride, (d) => overrideVerdict(deps, d));
  await one<AlertCaseJob>(QUEUES.alertCase, (d) => handleAlertCase(deps, d));
  await one<AlertNoticeJob>(QUEUES.alertNotice, (d) => handleAlertNotice(deps, d));
  await one<AlertGoNowJob>(QUEUES.alertGoNow, (d) => handleAlertGoNow(deps, d));
  await one<AlertTransferJob>(QUEUES.alertTransfer, (d) => handleAlertTransfer(deps, d));
  await one<WebhookJob>(QUEUES.webhook, (d) => handleWebhook(deps, d));
  await one<DialJob>(QUEUES.dial, async (d) => {
    const out = await handleDial(deps, d);
    if (out.decision === "error" && "retryable" in out && out.retryable) throw new RetryableJobError(out.error ?? "dial failed");
  });
  await one<Record<string, never>>(QUEUES.sweepLateness, () => handleSweepLateness(deps));
  await boss.schedule(QUEUES.sweepLateness, "*/5 * * * *", {}, { tz: deps.config.ELECTION_TZ });
}
