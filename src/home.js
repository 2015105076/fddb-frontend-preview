const { language, name, t, diagnosisName } = window.VoiceLanguage;
const number = new Intl.NumberFormat(language);
const percent = new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 });

function escapeLabel(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export function homePage({ casesUrl, secondaryUrl, secondaryLabel }) {
  return `<div class="voice-home">
    <section class="home-hero" aria-labelledby="home-title">
      <h1 id="home-title">${name}</h1>
      ${language === "en" ? '<p class="home-hospital-name">Eye &amp; ENT Hospital, Fudan University</p>' : ""}
      <p class="home-summary">${t("关联嗓音采集、诊断标签与标准化元音音频，支持咽喉疾病研究与病例检索。", "Explore voice recordings, diagnostic labels, and standardized vowel audio for research on laryngeal disorders.")}</p>
      <div class="home-actions">
        <a class="home-action home-action-primary" href="${casesUrl}">${t("浏览病例", "Browse cases")} <span aria-hidden="true">→</span></a>
        <a class="home-action" href="${secondaryUrl}">${secondaryLabel}</a>
      </div>
      <svg class="home-wave" viewBox="0 0 360 150" fill="none" aria-hidden="true">
        <path d="M0 75h360M0 33h360M0 117h360" stroke="currentColor" opacity=".26"/>
        <path d="M8 75h30l11-12 12 25 12-32 12 48 12-66 12 79 12-96 12 107 12-98 12 81 12-65 12 48 12-34 12 22 12-13h22l12-7 12 14 12-20 12 28 12-23 12 14h34" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </section>
    <section aria-labelledby="home-data-title">
      <div class="home-section-title"><h2 id="home-data-title">${t("数据概览", "Database overview")}</h2><p class="home-note">${t("按虚构示例数据统计", "Based on synthetic demo data")}</p></div>
      <div id="home-statistics" aria-busy="true"><p class="home-status" role="status">${t("正在加载统计数据", "Loading statistics")}…</p></div>
    </section>
    <section id="diagnosis-demographics" class="demographics" aria-label="${t("诊断类别年龄与性别统计", "Age and gender by diagnosis category")}"></section>
    <section aria-labelledby="home-about-title">
      <div class="home-section-title"><h2 id="home-about-title">${t("医院简介", "About the hospital")}</h2></div>
      <article class="home-hospital">
        <div class="home-hospital-year" aria-hidden="true">1952<small>${t("建院年份", "Founded")}</small></div>
        <div>
          <h3>${t("复旦大学附属眼耳鼻喉科医院", "Eye & ENT Hospital, Fudan University")}</h3>
          <p>${t("医院始建于 1952 年，又名上海市五官科医院，是以眼科和耳鼻咽喉科为特色的三级甲等专科医院，承担医疗、教学与科研工作。", "Founded in 1952, the Eye & ENT Hospital of Fudan University is a tertiary specialty hospital in Shanghai. It provides clinical care, education, and research in ophthalmology and otorhinolaryngology.")}</p>
          <a href="https://fudan.edu.cn/_s2/493/list.psp">${t("复旦大学附属医院介绍", "About Fudan University's affiliated hospitals")} <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    </section>
  </div>`;
}

function diagnosisBars(diagnoses, max) {
  return `<ul class="home-bars">${diagnoses.map((diagnosis) => {
    const { count } = diagnosis;
    const label = diagnosisName(diagnosis);
    return `<li class="home-bar">
      <span>${escapeLabel(label)}</span><strong>${number.format(count)}</strong>
      <div class="home-bar-track" aria-hidden="true"><span style="--share:${count / max * 100}%"></span></div>
    </li>`;
  }).join("")}</ul>`;
}

export function homeStatistics({ totalCases, totalAudio, completeCases, diagnoses }) {
  if (![totalCases, totalAudio, completeCases].every((value) => Number.isInteger(value) && value >= 0) ||
      completeCases > totalCases || !Array.isArray(diagnoses)) {
    throw new Error(t("统计数据格式不正确", "Invalid statistics data"));
  }

  const distribution = diagnoses.filter((item) => Number.isInteger(item.count) && item.count > 0)
    .sort((left, right) => right.count - left.count);
  const categoryCount = distribution.filter((item) => item.code !== "unlabeled").length;
  const visible = distribution.slice(0, 6);
  const remaining = distribution.slice(6);
  const max = visible[0]?.count;
  const share = totalCases ? completeCases / totalCases : 0;

  return `<dl class="home-metrics">
    ${[[totalCases, t("病例记录", "Case records")], [totalAudio, t("音频文件", "Audio files")], [categoryCount, t("已入库诊断类别", "Diagnosis categories in the database")]].map(([value, label]) =>
      `<div class="home-metric"><dt>${label}</dt><dd>${number.format(value)}</dd></div>`).join("")}
  </dl>
  <div class="home-charts">
    <article class="home-panel">
      <h3>${t("病例诊断分布", "Cases by diagnosis")}</h3>
      <p class="home-note">${t("按病例数从高到低排列 · 单位：例", "Ranked by case count")}</p>
      ${max ? diagnosisBars(visible, max) : `<p class="home-status">${t("暂无诊断分布数据", "No diagnosis distribution data")}</p>`}
      ${remaining.length ? `<details class="home-more"><summary>${t("展开其余", "Show")} ${remaining.length} ${t("项", "more categories")}</summary>${diagnosisBars(remaining, max)}</details>` : ""}
    </article>
    <article class="home-panel">
      <h3>${t("六元音采集完整度", "Six-vowel completeness")}</h3>
      <p class="home-note">${t("覆盖 /a/ /o/ /e/ /i/ /u/ /v/ 的病例占比", "Share of cases with /a/, /o/, /e/, /i/, /u/, and /v/ recordings")}</p>
      ${totalCases ? `<div class="home-ring" style="--share:${share * 100}%">
        <strong aria-label="${t("完整病例占比", "Share of complete cases")} ${percent.format(share)}">${percent.format(share)}</strong>
      </div>
      <dl class="home-key">
        <div><dt>${t("六元音齐全", "All six vowels")}</dt><dd><strong>${number.format(completeCases)}</strong> ${t("例", "cases")}</dd></div>
        <div><dt>${t("缺少至少一个元音", "Missing at least one vowel")}</dt><dd><strong>${number.format(totalCases - completeCases)}</strong> ${t("例", "cases")}</dd></div>
      </dl>` : `<p class="home-status">${t("暂无病例可计算完整度", "No cases available to calculate completeness")}</p>`}
    </article>
  </div>`;
}

export function homeStatisticsUnavailable(host) {
  host.innerHTML = `<p class="home-status" role="status">${t("暂时无法加载统计数据。可继续查看医院简介，或刷新页面重试。", "Statistics are temporarily unavailable. You can still read about the hospital or refresh to try again.")}</p>`;
}
