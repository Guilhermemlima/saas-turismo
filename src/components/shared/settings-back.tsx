import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export function SettingsBack() {
  return (
    <Link href="/settings" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2 w-fit" })}>
      <ArrowLeft /> Configurações
    </Link>
  );
}
