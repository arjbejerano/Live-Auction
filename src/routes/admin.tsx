import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { readSession } from "@/lib/session";

/**
 * Route guard: everything under /admin/* requires role === "ADMIN".
 * ssr:false because the simulated session lives in localStorage, which the
 * server cannot read (a real build would check a JWT claim here instead).
 */
export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: () => {
    const session = readSession();
    if (!session) throw redirect({ to: "/" });
    if (session.role !== "ADMIN") throw redirect({ to: "/" });
    return { session };
  },
  component: () => <Outlet />,
});
