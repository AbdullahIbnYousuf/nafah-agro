import { z } from "zod";

export const ANALYTICS_MAX_RANGE_DAYS = 366;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Date must be a valid YYYY-MM-DD value");

function inclusiveDays(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000) + 1;
}

export const analyticsDashboardQuerySchema = z.object({
  preset: z.enum(["today", "yesterday", "week", "month", "custom"]).default("today"),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
}).strict().superRefine((value, context) => {
  if (value.preset !== "custom") {
    if (value.from !== undefined || value.to !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["from"],
        message: "from and to are accepted only for the custom preset",
      });
    }
    return;
  }

  if (!value.from) {
    context.addIssue({ code: "custom", path: ["from"], message: "from is required for a custom range" });
  }
  if (!value.to) {
    context.addIssue({ code: "custom", path: ["to"], message: "to is required for a custom range" });
  }
  if (!value.from || !value.to) return;
  if (value.from > value.to) {
    context.addIssue({ code: "custom", path: ["to"], message: "to must be on or after from" });
    return;
  }
  if (inclusiveDays(value.from, value.to) > ANALYTICS_MAX_RANGE_DAYS) {
    context.addIssue({
      code: "custom",
      path: ["to"],
      message: `Custom ranges cannot exceed ${ANALYTICS_MAX_RANGE_DAYS} days`,
    });
  }
});

export type AnalyticsDashboardQuery = z.infer<typeof analyticsDashboardQuerySchema>;
