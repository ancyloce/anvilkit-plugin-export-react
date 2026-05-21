import { BlogList } from "@anvilkit/blog-list";

export default function Page(): JSX.Element {
  return (
    <BlogList posts={[{"title":"Ship log","slug":"/blog/ship-log","readingTimeMinutes":4},{"title":"Architecture diary","slug":"/blog/architecture-diary","readingTimeMinutes":7}]} />
  );
}
