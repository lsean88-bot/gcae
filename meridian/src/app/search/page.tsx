import { SearchView } from "@/components/rest-views";
import { searchAll } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  return <SearchView data={await searchAll(params.q || "")} />;
}