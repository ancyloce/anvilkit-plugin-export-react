import { PricingMinimal } from "@anvilkit/pricing-minimal";

export default function Page(): JSX.Element {
  return (
    <PricingMinimal
      headline="Simple, transparent pricing"
      tiers={[{"name":"Starter","price":0,"features":["5 pages","Community"]},{"name":"Pro","price":29,"features":["Unlimited","Priority"]}]}
    />
  );
}
