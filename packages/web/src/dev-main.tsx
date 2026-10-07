import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { GlobeHost } from "@/components/globe-host";
import { LandingPage } from "@/components/landing-page";
import { GlobeView } from "@/components/globe-view";
import { AppErrorComponent } from "@/lib/error-component";
import "./styles.css";

const rootRoute = createRootRoute({
  component: () => (
    <>
      <GlobeHost />
      <Outlet />
    </>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const mapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/map",
  component: GlobeView,
});

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, mapRoute]),
  defaultErrorComponent: AppErrorComponent,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
