import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enCommon from "@/locales/en/common.json";
import enDashboard from "@/locales/en/dashboard.json";
import enErrors from "@/locales/en/errors.json";
import enTools from "@/locales/en/tools.json";
import enWorkspace from "@/locales/en/workspace.json";
import enPipeline from "@/locales/en/pipeline.json";
import enRecovery from "@/locales/en/recovery.json";
import enSettings from "@/locales/en/settings.json";
import skCommon from "@/locales/sk/common.json";
import skDashboard from "@/locales/sk/dashboard.json";
import skErrors from "@/locales/sk/errors.json";
import skTools from "@/locales/sk/tools.json";
import skWorkspace from "@/locales/sk/workspace.json";
import skPipeline from "@/locales/sk/pipeline.json";
import skRecovery from "@/locales/sk/recovery.json";
import skSettings from "@/locales/sk/settings.json";
import { useAppStore, type Language } from "@/stores/appStore";

const initialization = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "sk"],
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
    resources: {
      en: {
        common: enCommon,
        dashboard: enDashboard,
        errors: enErrors,
        tools: enTools,
        workspace: enWorkspace,
        pipeline: enPipeline,
        recovery: enRecovery,
        settings: enSettings,
      },
      sk: {
        common: skCommon,
        dashboard: skDashboard,
        errors: skErrors,
        tools: skTools,
        workspace: skWorkspace,
        pipeline: skPipeline,
        recovery: skRecovery,
        settings: skSettings,
      },
    },
    ns: ["common", "dashboard", "errors", "tools", "workspace", "pipeline", "recovery", "settings"],
    defaultNS: "common",
  });

void initialization.then(() => {
  const detected: Language = i18n.resolvedLanguage === "sk" ? "sk" : "en";
  if (useAppStore.getState().language !== detected) {
    useAppStore.setState({ language: detected });
  }
  useAppStore.subscribe((state, previous) => {
    if (state.language !== previous.language && i18n.resolvedLanguage !== state.language) {
      void i18n.changeLanguage(state.language);
    }
  });
});

export default i18n;
