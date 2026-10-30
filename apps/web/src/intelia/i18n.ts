import i18n from "i18next";

type Bundle = Record<string, unknown>;

// Our strings live in the `intelia` namespace, outside upstream's
// `i18n/*.json`, so upstream merges never touch them. Bundles merge deeply:
// each feature registers its own top-level key.
export function registerInteliaI18n(en: Bundle, es: Bundle): void {
  const instance = i18n as unknown as {
    addResourceBundle?: (
      lng: string,
      ns: string,
      resources: unknown,
      deep?: boolean,
      overwrite?: boolean,
    ) => void;
    on?: (event: string, callback: () => void) => void;
  };

  if (typeof instance.addResourceBundle === "function") {
    for (const lng of ["en", "en-US"]) {
      instance.addResourceBundle(lng, "intelia", en, true, true);
    }
    for (const lng of ["es", "es-ES"]) {
      instance.addResourceBundle(lng, "intelia", es, true, true);
    }
  } else if (typeof instance.on === "function") {
    instance.on("initialized", () => {
      registerInteliaI18n(en, es);
    });
  }
}
