import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { App } from "./App.tsx";
import { AuthProvider } from "./lib/auth.tsx";
import { SetupPage } from "./pages/Setup.tsx";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

if (!convexUrl) {
  createRoot(root).render(
    <StrictMode>
      <SetupPage />
    </StrictMode>,
  );
} else {
  const convex = new ConvexReactClient(convexUrl);
  createRoot(root).render(
    <StrictMode>
      <ConvexProvider client={convex}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ConvexProvider>
    </StrictMode>,
  );
}
