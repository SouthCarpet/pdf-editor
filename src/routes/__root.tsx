import { Outlet, createRootRoute } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

// Phase 17 Task 86 - wrap every routed view in <AppErrorBoundary>. The
// boundary sits inside <Layout> so the TopBar stays interactive even
// when a child route throws.
export const Route = createRootRoute({
  component: () => (
    <Layout>
      <AppErrorBoundary>
        <Outlet />
      </AppErrorBoundary>
    </Layout>
  ),
});
