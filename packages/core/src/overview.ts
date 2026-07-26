export interface OverviewSet {
  createdAt: number;
  weightKg: number;
  reps: number;
  exerciseName: string;
}

/** Agregado de UNA ventana. `buildOverview` devuelve las dos ya emparejadas; esto
 *  se exporta para poder testear el agregado por separado. */
export interface OverviewTotals {
  workouts: number;
  effectiveSets: number;
  reps: number;
  tonnageKg: number;
  heaviest: { weightKg: number; exerciseName: string } | null;
}

export interface OverviewMetric {
  current: number;
  previous: number;
  changePercent: number | null;
}

export interface Overview {
  workouts: OverviewMetric;
  effectiveSets: OverviewMetric;
  reps: OverviewMetric;
  tonnageKg: OverviewMetric;
  heaviest: OverviewMetric & { exerciseName: string | null };
}

/** `null` cuando el periodo anterior vale 0: no hay división posible. */
export function percentChange(current: number, previous: number): number | null {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
}

export function overviewTotals(
  sets: readonly OverviewSet[],
  workoutStarts: readonly number[],
): OverviewTotals {
  let reps = 0;
  let tonnageKg = 0;
  let heaviest: { weightKg: number; exerciseName: string } | null = null;
  let heaviestAt = Number.NEGATIVE_INFINITY;

  for (const set of sets) {
    reps += set.reps;
    tonnageKg += set.weightKg * set.reps;
    // Gana el peso mayor; en empate, la serie más reciente (spec §3).
    const wins =
      heaviest === null ||
      set.weightKg > heaviest.weightKg ||
      (set.weightKg === heaviest.weightKg && set.createdAt >= heaviestAt);
    if (wins) {
      heaviest = { weightKg: set.weightKg, exerciseName: set.exerciseName };
      heaviestAt = set.createdAt;
    }
  }

  return { workouts: workoutStarts.length, effectiveSets: sets.length, reps, tonnageKg, heaviest };
}

/**
 * Ventanas `[currentFrom, currentTo]` y `[previousFrom, currentFrom)`: el instante
 * `currentFrom` pertenece solo a la actual, sin solape ni hueco.
 *
 * Recibe únicamente series EFECTIVAS: el filtro de calentamiento lo hace la consulta
 * (`listEffectiveSetsBetween`), no esta función.
 */
export function buildOverview(input: {
  sets: readonly OverviewSet[];
  workoutStarts: readonly number[];
  currentFrom: number;
  currentTo: number;
  previousFrom: number;
}): Overview {
  const inCurrent = (at: number): boolean => at >= input.currentFrom && at <= input.currentTo;
  const inPrevious = (at: number): boolean => at >= input.previousFrom && at < input.currentFrom;

  const current = overviewTotals(
    input.sets.filter((s) => inCurrent(s.createdAt)),
    input.workoutStarts.filter(inCurrent),
  );
  const previous = overviewTotals(
    input.sets.filter((s) => inPrevious(s.createdAt)),
    input.workoutStarts.filter(inPrevious),
  );

  const metric = (currentValue: number, previousValue: number): OverviewMetric => ({
    current: currentValue,
    previous: previousValue,
    changePercent: percentChange(currentValue, previousValue),
  });
  const heaviestKg = (totals: OverviewTotals): number => totals.heaviest?.weightKg ?? 0;

  return {
    workouts: metric(current.workouts, previous.workouts),
    effectiveSets: metric(current.effectiveSets, previous.effectiveSets),
    reps: metric(current.reps, previous.reps),
    tonnageKg: metric(current.tonnageKg, previous.tonnageKg),
    heaviest: {
      ...metric(heaviestKg(current), heaviestKg(previous)),
      exerciseName: current.heaviest?.exerciseName ?? null,
    },
  };
}
