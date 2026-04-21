import { Helps } from "@anvilkit/helps";

export default function Page() {
  return (
    <Helps
      heading="Frequently asked"
      items={[{"q":"How do I install?","a":"Run pnpm add @anvilkit/core."},{"q":"Does it support React 19?","a":"Yes, via the peer range."}]}
    />
  );
}
