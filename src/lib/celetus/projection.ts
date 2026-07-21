// Pure helpers for month projections. Consume `days` returned by getDashboard.
export type DayLike = {
  date: string;
  revenue: number;
  invest_final: number;
  profit: number;
};

export type ProjectionMoney = {
  revenue: number;
  invest: number;
  profit: number;
};

function brtToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function sumMoney(days: DayLike[]): ProjectionMoney {
  return days.reduce(
    (acc, d) => ({
      revenue: acc.revenue + Number(d.revenue || 0),
      invest: acc.invest + Number(d.invest_final || 0),
      profit: acc.profit + Number(d.profit || 0),
    }),
    { revenue: 0, invest: 0, profit: 0 },
  );
}

function divideMoney(v: ProjectionMoney, divisor: number): ProjectionMoney {
  const safe = divisor > 0 ? divisor : 1;
  return {
    revenue: v.revenue / safe,
    invest: v.invest / safe,
    profit: v.profit / safe,
  };
}

function scaleMoney(v: ProjectionMoney, factor: number): ProjectionMoney {
  return {
    revenue: v.revenue * factor,
    invest: v.invest * factor,
    profit: v.profit * factor,
  };
}

function addMoney(a: ProjectionMoney, b: ProjectionMoney): ProjectionMoney {
  return {
    revenue: a.revenue + b.revenue,
    invest: a.invest + b.invest,
    profit: a.profit + b.profit,
  };
}

export function roiOf(v: ProjectionMoney): number {
  return v.invest > 0 ? v.profit / v.invest : 0;
}

export function computeProjection(
  days: DayLike[],
  opts?: { referenceDate?: string; monthYear?: number; monthMonth?: number; activeStart?: boolean },
) {
  const today = opts?.referenceDate ?? brtToday();
  const [ty, tm, td] = today.split("-").map(Number);

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
  const isFutureMonth = year > ty || (year === ty && month > tm);

  const monthDays = days
    .filter((d) => {
      const [dy, dm] = d.date.split("-").map(Number);
      return dy === year && dm === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentDay = isCurrentMonth ? Math.min(Math.max(td, 1), daysInMonth) : daysInMonth;
  const upToToday = isFutureMonth
    ? []
    : monthDays.filter((d) => {
        if (!isCurrentMonth) return true;
        const [, , dd] = d.date.split("-").map(Number);
        return dd <= currentDay;
      });

  let daysElapsed = isFutureMonth ? 0 : currentDay;
  if (opts?.activeStart && !isFutureMonth) {
    const firstActive = upToToday.find(
      (d) => Number(d.revenue || 0) !== 0 || Number(d.invest_final || 0) !== 0 || Number(d.profit || 0) !== 0,
    );
    if (firstActive) {
      const [, , fd] = firstActive.date.split("-").map(Number);
      daysElapsed = Math.max(1, currentDay - fd + 1);
    }
  }
  const daysRemaining = Math.max(0, daysInMonth - (isFutureMonth ? 0 : currentDay));
  const monthClosed = !isCurrentMonth || daysRemaining === 0;

  const realized = sumMoney(upToToday);

  // Run-rate projection: calendar-day average up to today. This avoids inflated
  // numbers from active-day-only averages, but still must not be treated as a
  // probable close when the month has barely started.
  const runningAverage = divideMoney(realized, daysElapsed || 1);
  const runRateProjection = monthClosed
    ? realized
    : addMoney(realized, scaleMoney(runningAverage, daysRemaining));
  const projectionReady = monthClosed || daysElapsed >= 3;
  const projectedPace = runRateProjection;

  // Secondary signal: recent calendar pace including zero days, useful when
  // the current week changed but still grounded in real elapsed days.
  const recentWindowSize = Math.min(7, upToToday.length);
  const recentDays = recentWindowSize > 0 ? upToToday.slice(-recentWindowSize) : [];
  const recentAverage = divideMoney(sumMoney(recentDays), recentDays.length || 1);
  const recentRunRateProjection = monthClosed
    ? realized
    : addMoney(realized, scaleMoney(recentAverage, daysRemaining));
  const projectedRecent = recentRunRateProjection;


  // Reference only: active-day average can be useful, but should not be the
  // headline projection because it usually overstates the month.
  const activeDays = upToToday.filter(
    (d) => d.revenue !== 0 || d.invest_final !== 0 || d.profit !== 0,
  );
  const activeAverage = divideMoney(sumMoney(activeDays), activeDays.length || 1);
  const activeProjection = monthClosed ? realized : scaleMoney(activeAverage, daysInMonth);

  return {
    year,
    month,
    daysInMonth,
    daysElapsed,
    daysRemaining,
    activeDays: activeDays.length,
    recentDays: recentDays.length,
    isCurrentMonth,
    isFutureMonth,
    monthClosed,
    projectionReady,
    realized,
    runningAverage,
    activeAverage,
    recentAverage,
    runRateProjection,
    recentRunRateProjection,
    projectedPace,
    projectedRecent,
    activeProjection,
    recommended: projectedPace,
    avg: runningAverage,
    last7Avg: recentAverage,
    projectionAvg: projectedPace,
    projectionLast7: projectedRecent,
  };
}

export type Projection = ReturnType<typeof computeProjection>;
