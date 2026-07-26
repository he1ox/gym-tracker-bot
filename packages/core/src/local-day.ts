interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// `hourCycle: 'h23'` y NO `hour12: false`: si `hour12` está presente, `hourCycle`
// se ignora y la medianoche puede salir como "24" en vez de "00".
function partsIn(instant: number, timeZone: string): LocalParts {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));

  const read = (type: string): number => {
    const part = formatted.find((p) => p.type === type);
    if (part === undefined) {
      throw new Error(`Could not read ${type} for timezone ${timeZone}`);
    }
    return Number(part.value);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

// Las partes locales leídas como si fueran UTC. Es un instante ficticio, útil solo
// para restar: la diferencia con el instante real es el desfase de la zona.
function localAsUtc(instant: number, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

// Desfase de la zona respecto a UTC, en ms, EN ESE INSTANTE (no es constante:
// cambia con el horario de verano). Se truncan los milisegundos porque
// formatToParts no los devuelve y falsearían la resta.
function offsetMsAt(instant: number, timeZone: string): number {
  return localAsUtc(instant, timeZone) - Math.floor(instant / 1000) * 1000;
}

/**
 * Epoch en milisegundos de las 00:00 locales del día que contiene `instant`.
 *
 * Dos pasadas: la primera usa el desfase del propio `instant`, que en un día de
 * cambio de horario puede no ser el de las 00:00 de ese día; la segunda corrige
 * usando el desfase del candidato.
 */
export function startOfLocalDay(instant: Date, timeZone: string): number {
  const time = instant.getTime();
  const p = partsIn(time, timeZone);
  const midnightAsUtc = Date.UTC(p.year, p.month - 1, p.day);

  const first = midnightAsUtc - offsetMsAt(time, timeZone);
  const second = midnightAsUtc - offsetMsAt(first, timeZone);

  // La segunda pasada es la buena salvo cuando el adelanto de horario BORRA las
  // 00:00 locales (Santiago, La Habana: ese día empieza a la 1:00). Ahí ninguna
  // de las dos cae en medianoche y el arranque real del día es la posterior.
  return localAsUtc(second, timeZone) === midnightAsUtc ? second : Math.max(first, second);
}
