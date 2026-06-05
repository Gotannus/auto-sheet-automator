import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getAuthMode } from "@/lib/celetus/auth.functions";
import { routeAfterLogin } from "@/lib/celetus/navigation";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { loginRequired } = await getAuthMode();
    if (loginRequired) {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw redirect({ to: "/auth" });
    }

    const to = await routeAfterLogin();
    throw redirect({ to, replace: true });
  },
});
