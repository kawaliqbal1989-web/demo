import { useCallback, useEffect, useMemo, useState } from "react";
import { getDashboardFilterCatalog } from "../services/bp-dashboard.api";

function sortOptions(options = []) {
  return [...options].sort((left, right) => left.label.localeCompare(right.label));
}

function useDashboardFilterOptions() {
  const [franchises, setFranchises] = useState([]);
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { franchises: franchiseRows, hierarchyNodes } = await getDashboardFilterCatalog();
      setFranchises(
        sortOptions(
          franchiseRows.map((franchise) => ({
            code: franchise.code || "",
            label: franchise.displayName || franchise.name || franchise.code,
            nodeId: franchise.authUser?.hierarchyNodeId || null,
            value: franchise.id
          }))
        )
      );

      setCenters(
        sortOptions(
          hierarchyNodes
            .filter((node) => node.type === "CENTER")
            .map((node) => ({
              code: node.code || "",
              label: node.name || node.code || node.id,
              parentNodeId: node.parent?.id || null,
              value: node.id
            }))
        )
      );
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return useMemo(
    () => ({
      centers,
      error,
      franchises,
      loading,
      retry: load
    }),
    [centers, error, franchises, load, loading]
  );
}

export { useDashboardFilterOptions };