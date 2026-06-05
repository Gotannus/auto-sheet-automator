import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthMode } from "@/lib/celetus/auth.functions";
import { routeAfterLogin } from "@/lib/celetus/navigation";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { loginRequired } = await getAuthMode();
    if (!loginRequired) {
      throw redirect({ to: "/tannus", replace: true });
    }

    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw redirect({ to: await routeAfterLogin(), replace: true });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setLoading(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("lovable", {
      redirect_uri: window.location.origin,
    });
    setLoading(false);

    if (result.error) {
      setError(result.error.message);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar no painel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={signIn} disabled={loading}>
            {loading ? "Entrando..." : "Entrar com Lovable"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
