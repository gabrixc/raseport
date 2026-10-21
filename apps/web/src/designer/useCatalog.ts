import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase.ts";
import { toSourceInfo, type CatalogRow, type SourceInfo } from "./sources.ts";

export interface Catalog {
  sources: SourceInfo[] | null;
  loading: boolean;
  /** set when the catalogue could not be read (for example the migration is not applied yet) */
  error: string | null;
  reload: () => void;
}

/** The report_* functions this user can use as data sources, from the database's report_catalog(). */
export function useCatalog(): Catalog {
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("report_catalog");
    if (error) {
      setError(error.message);
      setSources(null);
    } else {
      setError(null);
      setSources(((data ?? []) as CatalogRow[]).map(toSourceInfo));
    }
    setLoading(false);
  }, []);

  useEffect(() => void load(), [load]);
  return { sources, loading, error, reload: () => void load() };
}
