import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerOnly } from "@/components/OwnerOnly";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";
import "./types/global.d.ts";

import { CONVEX_URL } from "./lib/convex-url";

import Landing from "./pages/Landing";
import Legal from "./pages/Legal";
import Demo from "./pages/Demo";
import { AppShell } from "@/components/AppShell";
import AuthPage from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import BuyerIntake from "./pages/BuyerIntake";
import Operations from "./pages/Operations";
import Toolkit from "./pages/Toolkit";
import LocalAgents from "./pages/LocalAgents";
import SharedConversation from "./pages/SharedConversation";
import NotFound from "./pages/NotFound";

const convex = new ConvexReactClient(CONVEX_URL);



function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <VlyToolbar />
    <InstrumentationProvider>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/legal" element={<Legal />} />
            <Route path="/demo" element={<Demo />} />
            <Route
              path="/auth"
              element={<AuthPage redirectAfterAuth="/dashboard" />}
            />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route path="/buyers" element={<BuyerIntake />} />
            <Route
              path="/operations"
              element={
                <OwnerOnly>
                  <Operations />
                </OwnerOnly>
              }
            />
            <Route
              path="/toolkit"
              element={
                <OwnerOnly>
                  <Toolkit />
                </OwnerOnly>
              }
            />
            <Route
              path="/local-agents"
              element={
                <OwnerOnly>
                  <LocalAgents />
                </OwnerOnly>
              }
            />
            <Route
              path="/shared-conversation"
              element={
                <OwnerOnly>
                  <SharedConversation />
                </OwnerOnly>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </InstrumentationProvider>
  </StrictMode>,
);
