import type { Metadata } from "next";

import { InboxView } from "@/modules/inbox/inbox-view";

export const metadata: Metadata = { title: "Atendimentos" };

export default async function InboxPage(props: PageProps<"/inbox">) {
  return <InboxView searchParams={await props.searchParams} />;
}
