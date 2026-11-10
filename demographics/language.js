(() => {
  const preference = "voice-db-lang";
  const names = {
    en: "FDEENT VOICE DATABASE",
    "zh-CN": "复旦大学附属眼耳鼻喉科医院嗓音数据库",
  };
  const urlLanguage = new URLSearchParams(location.search).get("lang");
  const savedLanguage = document.cookie.split("; ").find((entry) => entry.startsWith(preference + "="))?.split("=")[1];
  const language = [urlLanguage, savedLanguage, "en"].find((value) => Object.hasOwn(names, value));
  const chinese = language === "zh-CN";
  const t = (zh, en) => chinese ? zh : en;
  const name = names[language];

  function save(value) {
    document.cookie = preference + "=" + value + "; Path=/; Max-Age=31536000; SameSite=Lax";
  }

  if (Object.hasOwn(names, urlLanguage)) save(urlLanguage);
  document.documentElement.lang = language;

  function applyLanguage() {
    document.querySelectorAll("[data-zh]").forEach((element) => {
      if (chinese) element.textContent = element.dataset.zh;
    });
    document.querySelectorAll("[data-zh-placeholder], [data-zh-aria-label]").forEach((element) => {
      if (!chinese) return;
      if (element.dataset.zhPlaceholder) element.placeholder = element.dataset.zhPlaceholder;
      if (element.dataset.zhAriaLabel) element.setAttribute("aria-label", element.dataset.zhAriaLabel);
    });
    document.querySelectorAll("[data-language-picker]").forEach((element) => {
      element.value = language;
      element.setAttribute("aria-label", t("网页语言", "Website language"));
    });
  }

  function picker() {
    return `<select class="language-picker" data-language-picker aria-label="${t("网页语言", "Website language")}">
      <option value="en" lang="en"${chinese ? "" : " selected"}>English</option>
      <option value="zh-CN" lang="zh-CN"${chinese ? " selected" : ""}>中文</option>
    </select>`;
  }

  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-language-picker]")) return;
    const value = event.target.value;
    if (!Object.hasOwn(names, value)) return;
    save(value);
    const url = new URL(location.href);
    url.searchParams.set("lang", value);
    location.assign(url.href);
  });

  function diagnosisName({ code, name: original, name_en: english }) {
    if (code === "unlabeled") return t("未标注", "Unlabeled");
    return (chinese ? original : english || original) || code;
  }

  document.addEventListener("DOMContentLoaded", applyLanguage);
  window.VoiceLanguage = { language, name, t, picker, diagnosisName };
})();
