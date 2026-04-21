import { Statistics } from "@anvilkit/statistics";

export default function Page(): JSX.Element {
  return (
    <Statistics items={[{"value":"99.99%","label":"Uptime"},{"value":"20ms","label":"p95 latency"}]} />
  );
}
