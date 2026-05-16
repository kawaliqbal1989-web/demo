import { useEffect, useState } from "react";
import { getCenterCapacity } from "../services/capacityService";

function useCenterCapacitySnapshot() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await getCenterCapacity();
        if (!cancelled) {
          setData(response?.data ?? null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return {
    data,
    error,
    loading,
    retry: () => setRefreshTick((current) => current + 1)
  };
}

export { useCenterCapacitySnapshot };