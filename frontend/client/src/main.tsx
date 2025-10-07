import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import App from "./App.tsx";
import { queryClient } from "./lib/queryClient.ts";
import "./index.css";

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <GoogleReCaptchaProvider reCaptchaKey={RECAPTCHA_SITE_KEY}>
        <App />
      </GoogleReCaptchaProvider>
    </QueryClientProvider>
  </React.StrictMode>
);