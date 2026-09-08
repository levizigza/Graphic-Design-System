import { sleep } from "../canva/client.js";

export type PollStatus = "pending" | "completed" | "failed" | "partial";

export type AsyncPollResult<T> = {
  status: PollStatus;
  value: T;
  polls: number;
};

export type PollAsyncJobOptions<T> = {
  maxPolls: number;
  pollIntervalMs: number;
  /** Initial fetch (kickoff). */
  kickoff: () => Promise<{ status: PollStatus; value: T }>;
  /** Subsequent polls — receive prior value (e.g. job id). */
  poll: (prior: T) => Promise<{ status: PollStatus; value: T }>;
  sleepFn?: (ms: number) => Promise<void>;
  onPoll?: (info: { poll: number; status: PollStatus }) => void;
};

/**
 * Generic async job polling with bounded polls.
 * Treats `partial` as still-in-progress unless max polls exhausted.
 */
export async function pollAsyncJob<T>(
  options: PollAsyncJobOptions<T>,
): Promise<AsyncPollResult<T>> {
  const sleepFn = options.sleepFn ?? sleep;
  let { status, value } = await options.kickoff();
  let polls = 0;

  while (
    (status === "pending" || status === "partial") &&
    polls < options.maxPolls
  ) {
    polls += 1;
    options.onPoll?.({ poll: polls, status });
    await sleepFn(options.pollIntervalMs);
    const next = await options.poll(value);
    status = next.status;
    value = next.value;
  }

  return { status, value, polls };
}
