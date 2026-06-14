"use client";

import { useState } from "react";

/**
 * Estado local que se resincroniza cuando cambia el valor de origen (props).
 * Patrón recomendado por React (ajuste en render), sin useEffect ni flash de
 * estado viejo. Útil para estado optimista que se reconcilia tras router.refresh().
 */
export function useSyncedState<T>(value: T) {
  const [state, setState] = useState<T>(value);
  const [prev, setPrev] = useState<T>(value);
  if (value !== prev) {
    setPrev(value);
    setState(value);
  }
  return [state, setState] as const;
}
