import { createFileRoute } from "@tanstack/react-router";
import { GlobeView } from "@/components/globe-view";

export const Route = createFileRoute("/map")({ component: MapPage });

function MapPage() {
  return <GlobeView />;
}
