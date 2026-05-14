/**
 * Apify monthly-usage check. Surfaces a warning in the daily email when
 * credit is low or exhausted — so we notice before Zillow stops working.
 */

export type ApifyStatus = "ok" | "warning" | "critical" | "exhausted" | "unknown";

export interface ApifyBalance {
  status: ApifyStatus;
  usedUsd: number;
  capUsd: number;
  remainingUsd: number;
  percentage: number; // 0-100
  plan: string; // e.g. "STARTER"
}

const WARN_THRESHOLD = 0.7; // 70% of cap used → "warning"
const CRITICAL_THRESHOLD = 0.9; // 90% of cap used → "critical"

export async function checkApifyBalance(): Promise<ApifyBalance | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;

  try {
    const [userRes, usageRes] = await Promise.all([
      fetch(`https://api.apify.com/v2/users/me?token=${token}`, {
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${token}`, {
        signal: AbortSignal.timeout(8000),
      }),
    ]);
    if (!userRes.ok || !usageRes.ok) return null;

    const user = (await userRes.json()) as any;
    const usage = (await usageRes.json()) as any;

    const plan = user?.data?.plan?.id ?? "?";
    const capUsd = Number(user?.data?.plan?.maxMonthlyUsageUsd ?? 0);

    // Sum all monthly service-usage line items.
    const services = usage?.data?.monthlyServiceUsage ?? {};
    let usedUsd = 0;
    for (const v of Object.values(services)) {
      if (v && typeof v === "object") {
        const amt = (v as any).baseAmountUsd ?? (v as any).totalAmountUsd ?? 0;
        if (typeof amt === "number") usedUsd += amt;
      }
    }

    const remainingUsd = Math.max(0, capUsd - usedUsd);
    const percentage = capUsd > 0 ? Math.min(100, (usedUsd / capUsd) * 100) : 0;

    let status: ApifyStatus = "ok";
    if (capUsd > 0) {
      if (usedUsd >= capUsd) status = "exhausted";
      else if (percentage >= CRITICAL_THRESHOLD * 100) status = "critical";
      else if (percentage >= WARN_THRESHOLD * 100) status = "warning";
    }

    return { status, usedUsd, capUsd, remainingUsd, percentage, plan };
  } catch (err) {
    console.warn("apify balance check failed", err);
    return null;
  }
}
