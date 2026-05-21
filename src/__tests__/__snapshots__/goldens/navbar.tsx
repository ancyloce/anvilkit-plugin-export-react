import { Navbar } from "@anvilkit/navbar";

export default function Page(): JSX.Element {
  return (
    <Navbar
      brand="Anvilkit"
      links={[{"label":"Docs","href":"/docs"},{"label":"Pricing","href":"/pricing"}]}
    />
  );
}
