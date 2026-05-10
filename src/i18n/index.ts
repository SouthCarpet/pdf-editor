import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enCommon from "@/locales/en/common.json";
import enDashboard from "@/locales/en/dashboard.json";
import enErrors from "@/locales/en/errors.json";
import skCommon from "@/locales/sk/common.json";
import skDashboard from "@/locales/sk/dashboard.json";
import skErrors from "@/locales/sk/errors.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "sk"],
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
    resources: {
      en: { common: enCommon, dashboard: enDashboard, errors: enErrors },
      sk: { common: skCommon, dashboard: skDashboard, errors: skErrors },
    },
    ns: ["common", "dashboard", "errors"],
    defaultNS: "common",
  });

export default i18n;
