"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Brand } from "@/lib/types";

export function useBrandsChannels() {
  const [brands, setBrands] = useState<Brand[]>([]);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from("brands")
      .select("*")
      .order("name")
      .then((r) => r.data && setBrands(r.data as Brand[]));
  }, []);
  return { brands };
}

