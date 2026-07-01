// Pure helpers for month projections. Consume `days` returned by getDashboard.
export type DayLike = {
  date: string;
  revenue: number;
  invest_final: number;
  profit: number;
};

function brtToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function computeProjection(
  days: DayLike[],
  opts?: { referenceDate?: string; monthYear?: number; monthMonth?: number },
) {
  const today = opts?.referenceDate ?? brtToday();
  const [ty, tm, td] = today.split("-").map(Number);

  // Infer month/year from days if not given
  let year = opts?.monthYear;
  let month = opts?.monthMonth;
  if ((!year || !month) && days.length > 0) {
    const [y, m] = days[0].date.split("-").map(Number);
    year = y;
    month = m;
  }
  year = year ?? ty;
  month = month ?? tm;

  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrentMonth = year === ty && month === tm;

  // Filter to days that are within the month and up to today (if current month).
  const upToToday = days.filter((d) => {
    const [dy, dm, dd] = d.date.split("-").map(Number);
    if (dy !== year || dm !== month) return false;
    if (!isCurrentMonth) return true;
    return dd <= td;
  });

  const daysElapsed = isCurrentMonth ? td : daysInMonth;
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  const realizedRevenue = upToToday.reduce((a, d) => a + d.revenue, 0);
  const realizedInvest = upToToday.reduce((a, d) => a + d.invest_final, 0);
  const realizedProfit = upToToday.reduce((a, d) => a + d.profit, 0);

  // Days with any activity to avoid diluting the average with pre-launch zeros.
  const activeDays = upToToday.filter(
    (d) => d.revenue !== 0 || d.invest_final !== 0 || d.profit !== 0,
  );
  const activeCount = activeDays.length || daysElapsed || 1;

  const avgProfit = realizedProfit / activeCount;
  const avgRevenue = realizedRevenue / activeCount;
  const avgInvest = realizedInvest / activeCount;

  // Projection A: average daily * days in month
  const projA = {
    revenue: avgRevenue * daysInMonth,
    invest: avgInvest * daysInMonth,
    profit: avgProfit * daysInMonth,
  };

  // Projection B: last 7 days average * days remaining + realized
  const last7 = upToToday.slice(-7);
  const last7Active = last7.filter(
    (d) => d.revenue !== 0 || d.invest_final !== 0 || d.profit !== 0,
  );
  const l7count = last7Active.length || last7.length || 1;
  const l7profit = last7.reduce((a, d) => a + d.profit, 0) / l7count;
  const l7revenue = last7.reduce((a, d) => a + d.revenue, 0) / l7count;
  const l7invest = last7.reduce((a, d) => a + d.invest_final, 0) / l7count;
  const projB = {
    revenue: realizedRevenue + l7revenue * daysRemaining,
    invest: realizedInvest + l7invest * daysRemaining,
    profit: realizedProfit + l7profit * daysRemaining,
  };

  return {
    year,
    month,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    isCurrentMonth,
    realized: {
      revenue: realizedRevenue,
      invest: realizedInvest,
      profit: realizedProfit,
    },
    avg: { revenue: avgRevenue, invest: avgInvest, profit: avgProfit },
    last7Avg: { revenue: l7revenue, invest: l7invest, profit: l7profit },
    projectionAvg: projA,
    projectionLast7: projB,
  };
}

export type Projection = ReturnType<typeof computeProjection>;
