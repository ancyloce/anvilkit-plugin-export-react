import { LogoClouds } from "@anvilkit/logo-clouds";

export default function Page(): JSX.Element {
  return (
    <LogoClouds
      title="Trusted by teams everywhere"
      items={[{"label":"React","src":"/assets/logos/react.svg"},{"label":"Docker","src":"/assets/logos/docker.svg"}]}
    />
  );
}
