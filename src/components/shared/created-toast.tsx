"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** Shows a one-off toast after redirecting from the create form (?created=1), then cleans the URL. */
export function CreatedToast({ message }: { message: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("created") === "1") {
      toast.success(message);
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, router, pathname, message]);

  return null;
}
