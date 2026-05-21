import { Input } from "@anvilkit/input";

export default function Page(): JSX.Element {
  return (
    <Input name="email" placeholder="you@example.com" required={true} />
  );
}
