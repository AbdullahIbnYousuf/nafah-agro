import { waitUntil } from "@vercel/functions";

export type BackgroundTaskScheduler = (task: Promise<unknown>) => void;

export const scheduleBackgroundTask: BackgroundTaskScheduler = task => {
  const safeTask = task.catch(error => {
    console.error(JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      message: "Background task failed",
      error: error instanceof Error ? error.message : "Unknown background error",
    }));
  });
  if (process.env.VERCEL) {
    waitUntil(safeTask);
  } else {
    void safeTask;
  }
};
