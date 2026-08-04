import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import ko from "./locales/ko.json";
import ja from "./locales/ja.json";
import zhHans from "./locales/zh-Hans.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import ptBR from "./locales/pt-BR.json";
import ru from "./locales/ru.json";
import it from "./locales/it.json";

export const messages = {
  en,
  ko,
  ja,
  "zh-Hans": zhHans,
  es,
  fr,
  de,
  "pt-BR": ptBR,
  ru,
  it,
};

export const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  messages,
});
