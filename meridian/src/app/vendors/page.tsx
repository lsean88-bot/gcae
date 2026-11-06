import { VendorsView } from "@/components/rest-views";
import { getVendors } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <VendorsView data={await getVendors()} />;
}