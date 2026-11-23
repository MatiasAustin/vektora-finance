"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Brand, Channel } from "@/lib/types";

export function useBrandsChannels() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.from("brands").select("*").order("name").then((r) => r.data && setBrands(r.data as Brand[]));
    sb.from("channels").select("*").eq("is_active", true).order("name").then((r) => r.data && setChannels(r.data as Channel[]));
  }, []);
  return { brands, channels };
}
