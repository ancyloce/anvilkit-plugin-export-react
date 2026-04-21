import { BentoGrid } from "@anvilkit/bento-grid";

export default function Page(): JSX.Element {
  return (
    <BentoGrid
      theme="light"
      platform="web"
      items={[{"title":"Snapshots","description":"Lock output to a stable TSX baseline.","icon":"S","size":"wide"},{"title":"Linting","description":"Keep fixture modules clean and deterministic.","icon":"L","size":"default"}]}
    />
  );
}
