const { language, t, diagnosisName } = window.VoiceLanguage;
const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
const percentage = new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 });
const genders = [["male", t("男", "Male")], ["female", t("女", "Female")], ["unknown", t("未知", "Unknown")]];
const percent = (value, total) => total ? percentage.format(value / total) : "—";
const ageCount = (group) => group.count - group.age_missing;
const recordedGenderCount = (group) => group.count - group.gender_counts.unknown;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

async function fetchDemographics(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(t("统计接口请求失败", "Statistics request failed"));
  return response.json();
}

function ageChart(group, bands, mode) {
  const total = ageCount(group);
  if (!total) return `<p class="demo-empty">${t("暂无有效年龄记录。", "No valid age records.")}</p>`;

  const values = group.age_counts.map((count) => mode === "count" ? count : count / total);
  const peak = Math.max(...values);
  const max = mode === "count" ? Math.ceil(peak / 4) * 4 : Math.ceil(peak * 10) / 10;
  const format = mode === "count" ? (value) => number.format(value) : (value) => percentage.format(value);
  const ticks = [max, max / 2, 0];
  return `<div class="demo-histogram">
    <div class="demo-y-axis" aria-hidden="true">${ticks.map((tick) => `<span>${format(tick)}</span>`).join("")}</div>
    <ul class="demo-columns" aria-label="${t("按年龄段的病例分布", "Cases by age band")}">
      ${values.map((value, i) => {
        const count = group.age_counts[i];
        const share = percent(count, total);
        const exact = t(
          `${bands[i]} 岁，${number.format(count)} 例，占有效年龄病例的 ${share}`,
          `Ages ${bands[i]}: ${number.format(count)} cases (${share} of cases with a valid age)`,
        );
        return `<li class="demo-column">
          <div class="demo-bar-area" style="--height:${value / max * 100}%">
            <span class="demo-age-bar${value === peak ? " demo-peak" : ""}" aria-hidden="true"></span>
            <button class="demo-bar-target" type="button" aria-label="${exact}" data-chart-detail="${exact}">
              <span aria-hidden="true">${format(value)}</span>
            </button>
          </div>
          <span class="demo-bin" aria-hidden="true">${bands[i]}</span>
        </li>`;
      }).join("")}
    </ul>
  </div>
  <p class="demo-chart-detail" data-age-detail aria-live="polite">${t("聚焦或点击柱条查看病例数与占比。", "Focus or select a bar to see its case count and share.")}</p>`;
}

function genderChart(group) {
  if (!group.count) return `<p class="demo-empty">${t("该类别暂无病例。", "No cases in this category.")}</p>`;

  return `<div class="demo-gender-bar" aria-hidden="true">
    ${genders.map(([key]) => `<span class="demo-${key}" style="--width:${group.gender_counts[key] / group.count * 100}%"></span>`).join("")}
  </div>
  <dl class="demo-gender-key">
    ${genders.map(([key, label]) => {
      const count = group.gender_counts[key];
      return `<div><dt><i class="demo-${key}" aria-hidden="true"></i>${label}</dt>
        <dd><strong>${number.format(count)} ${t("例", "cases")}</strong><span>${percent(count, group.count)}</span></dd></div>`;
    }).join("")}
  </dl>`;
}

function describeAge(group, overall, bands) {
  const valid = ageCount(group);
  if (!valid) return t("该分组暂无有效年龄记录。", "No valid age records for this group.");

  const peak = Math.max(...group.age_counts);
  const peakBands = bands.filter((_, i) => group.age_counts[i] === peak);
  const leading = peakBands.join(t("、", ", "));
  const tied = peakBands.length > 1;
  const peakCount = number.format(peak);
  const binNote = t(
    `${leading} 岁组${tied ? "并列最多，各" : "最多，为"} ${peakCount} 例。`,
    tied ? `Age bands ${leading} tied for the most cases (${peakCount} each).` : `The ${leading} age band had the most cases (${peakCount}).`,
  );
  if (group.median_age === null) return binNote;

  const difference = group.median_age - overall.median_age;
  const baseline = group === overall || overall.median_age === null || !difference
    ? ""
    : t(
      `，比全库${difference > 0 ? "高" : "低"} ${number.format(Math.abs(difference))} 岁`,
      `, ${number.format(Math.abs(difference))} years ${difference > 0 ? "above" : "below"} the database median`,
    );
  return t(
    `年龄中位数为 ${number.format(group.median_age)} 岁${baseline}。${binNote}`,
    `Median age: ${number.format(group.median_age)} years${baseline}. ${binNote}`,
  );
}

function describeGender(group) {
  const { male, female, unknown } = group.gender_counts;
  const known = recordedGenderCount(group);
  const missing = unknown ? t(`另有 ${number.format(unknown)} 例性别未知。`, ` Another ${number.format(unknown)} cases had unknown gender.`) : "";
  if (!known) return t("该分组暂无已记录性别。", "No recorded gender for this group.");
  if (male === female) return `${t("性别已记录的", "Among")} ${number.format(known)} ${t("例中，男女各占一半。", "cases with recorded gender, male and female cases were equally represented.")}${missing}`;

  const leading = male > female ? t("男性", "male") : t("女性", "female");
  const share = percent(Math.max(male, female), known);
  return t(
    `性别已记录的 ${number.format(known)} 例中，${leading}占 ${share}。${missing}`,
    `Among ${number.format(known)} cases with recorded gender, ${share} were ${leading}.${missing}`,
  );
}

function ageComparison(categories) {
  const comparable = categories
    .filter((group) => group.code !== "unlabeled" && ageCount(group) >= 30)
    .sort((a, b) => a.median_age - b.median_age);
  if (comparable.length < 2) return "";

  const youngest = comparable[0];
  const oldest = comparable.at(-1);
  if (youngest.median_age === oldest.median_age) return "";
  const low = escapeHtml(youngest.name);
  const high = escapeHtml(oldest.name);
  const lowAge = number.format(youngest.median_age);
  const highAge = number.format(oldest.median_age);
  return `<p class="demo-comparison">${t(
    `有至少 30 条有效年龄记录的类别中，${low}的年龄中位数较低（${lowAge} 岁），${high}较高（${highAge} 岁）。`,
    `Among categories with at least 30 valid age records, ${low} had a lower median age (${lowAge} years) and ${high} had a higher median age (${highAge} years).`,
  )}</p>`;
}

function genderComparison(categories) {
  const groups = categories
    .filter((group) => group.code !== "unlabeled" && recordedGenderCount(group) >= 30)
    .map((group) => ({
      name: group.name,
      maleShare: group.gender_counts.male / recordedGenderCount(group),
    }))
    .sort((a, b) => a.maleShare - b.maleShare);
  if (groups.length < 2) return "";

  const mostlyFemale = groups[0];
  const mostlyMale = groups.at(-1);
  if (mostlyFemale.maleShare >= 0.5 || mostlyMale.maleShare <= 0.5) return "";
  const maleName = escapeHtml(mostlyMale.name);
  const femaleName = escapeHtml(mostlyFemale.name);
  const maleShare = percentage.format(mostlyMale.maleShare);
  const femaleShare = percentage.format(1 - mostlyFemale.maleShare);
  return `<p class="demo-comparison">${t(
    `在各有至少 30 例已记录性别的类别中，${maleName}的男性占比为 ${maleShare}，${femaleName}的女性占比为 ${femaleShare}。`,
    `Among categories with at least 30 cases with recorded gender, ${maleName} had a male share of ${maleShare} and ${femaleName} had a female share of ${femaleShare}.`,
  )}</p>`;
}

function selectedCharts(group, data, mode) {
  const total = ageCount(group);
  const ageMetric = group.median_age === null ? "—" : `${number.format(group.median_age)} ${t("岁", "years")}`;
  return `<div class="demo-profile">
    <div><span>${t("病例记录", "Case records")}</span><strong>${number.format(group.count)}</strong></div>
    <div><span>${t("年龄中位数", "Median age")}</span><strong>${ageMetric}</strong></div>
    <div><span>${t("有效年龄 / 总病例", "Valid age / total cases")}</span><strong>${number.format(total)} / ${number.format(group.count)}</strong></div>
  </div>
  <div class="demo-chart-grid">
    <article class="demo-chart">
      <h3>${t("年龄分布", "Age distribution")}</h3>
      <p class="demo-muted">${mode === "count" ? t("病例数", "Cases") : t("占有效年龄病例的比例", "Share of cases with a valid age")} · ${t("年龄缺失", "Missing age")} ${number.format(group.age_missing)} ${t("例", "cases")}</p>
      ${ageChart(group, data.age_bands, mode)}
    </article>
    <article class="demo-chart">
      <h3>${t("性别构成", "Gender breakdown")}</h3>
      <p class="demo-muted">${t("占该分组全部病例的比例", "Share of all cases in this group")}</p>
      ${genderChart(group)}
    </article>
  </div>
  <aside class="demo-reading" aria-live="polite">
    <h3>${t("分组解读", "Group summary")} · ${escapeHtml(group.name)}</h3>
    ${group.count ? `<p>${describeAge(group, data.overall, data.age_bands)}${t("", " ")}${describeGender(group)}</p>` : `<p>${t("该诊断标签暂无入库病例。", "No cases with this diagnosis label.")}</p>`}
    ${group === data.overall ? ageComparison(data.categories) + genderComparison(data.categories) : ""}
    ${group.count > 0 && group.count < 20 ? `<p class="demo-small">${t("该类别病例较少，单条记录即可明显改变占比。", "A single record can noticeably change percentages in this small category.")}</p>` : ""}
  </aside>`;
}

function heatCell(count, total, mode) {
  const share = total ? count / total * 100 : 0;
  const intensity = share ? Math.round(10 + 0.75 * share) : 0;
  const value = mode === "count" ? number.format(count) : percent(count, total);
  return `<td><span class="demo-heat-cell" style="--intensity:${intensity}%" title="${number.format(count)} ${t("例", "cases")} · ${percent(count, total)}">${value}</span></td>`;
}

function comparisonTable(data, selected, mode) {
  return `<div class="demo-table-wrap" tabindex="0" role="region" aria-label="${t("各诊断类别年龄与性别对照表", "Age and gender comparison across diagnosis categories")}">
    <table class="demo-table">
      <thead>
        <tr><th rowspan="2" scope="col">${t("诊断类别", "Diagnosis categories")}</th><th rowspan="2" scope="col">${t("病例数", "Cases")}</th>
          <th colspan="${data.age_bands.length + 1}" scope="colgroup">${t("年龄（岁）", "Age (years)")}</th><th colspan="3" scope="colgroup">${t("性别", "Gender")}</th></tr>
        <tr>${data.age_bands.map((band) => `<th scope="col">${band}</th>`).join("")}
          <th scope="col">${t("年龄缺失", "Missing age")}</th>${genders.map(([, label]) => `<th scope="col">${label}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${data.categories.map((group, i) => `<tr${selected === i ? ' class="demo-selected"' : ""}>
          <th scope="row"><button type="button" class="demo-row-button" data-group="${i}" aria-pressed="${selected === i}">${escapeHtml(group.name)}</button></th>
          <td>${number.format(group.count)}</td>
          ${group.age_counts.map((count) => heatCell(count, ageCount(group), mode)).join("")}
          ${heatCell(group.age_missing, group.count, mode)}
          ${genders.map(([key]) => heatCell(group.gender_counts[key], group.count, mode)).join("")}
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function renderExplorer(host, data) {
  data.overall.name = t("全部病例", "All cases");
  data.categories = data.categories.map((group) => ({ ...group, name: diagnosisName(group) }));
  host.innerHTML = `<div class="demo-toolbar">
    <label for="demo-category">${t("诊断类别", "Diagnosis categories")}
      <select id="demo-category"><option value="-1">${t("全部病例", "All cases")}</option>
        ${data.categories.map((group, i) => `<option value="${i}">${escapeHtml(group.name)}${t("（", " (")}${number.format(group.count)} ${t("例）", "cases)")}</option>`).join("")}
      </select>
    </label>
    <fieldset class="demo-mode"><legend>${t("显示方式", "Display mode")}</legend>
      <div><label><input type="radio" name="demo-mode" value="share" checked><span>${t("占比", "Share")}</span></label>
        <label><input type="radio" name="demo-mode" value="count"><span>${t("病例数", "Cases")}</span></label></div>
    </fieldset>
  </div>
  <div data-demo-chart></div>
  <div class="demo-table-title"><h3>${t("全部诊断类别对照", "Compare all diagnosis categories")}</h3><span class="demo-heat-key" aria-hidden="true">${t("占比低", "Lower share")} <i></i> ${t("占比高", "Higher share")}</span></div>
  <p class="demo-muted">${t("点击类别名称可切换上方图表。年龄段占比按有效年龄计算，年龄缺失和性别占比按各类别全部病例计算。", "Select a diagnosis category to update the charts above. Age-band percentages use cases with a valid age. Missing-age and gender percentages use all cases in each category.")}</p>
  <div data-demo-table></div>
  <p class="demo-method">${t("数据范围为当前入库病例记录。同一患者如有多条采集记录，按记录分别计数。有效年龄为 0–120 岁，少于 5 条有效年龄时省略中位数。分布反映入库样本构成。", "Each recording session counts as one case, including repeated sessions from the same patient. Valid ages range from 0 to 120 years. Median age is shown for groups with at least five valid ages.")}</p>`;

  const select = host.querySelector("#demo-category");
  const charts = host.querySelector("[data-demo-chart]");
  const table = host.querySelector("[data-demo-table]");
  const updateCharts = () => {
    const selected = Number(select.value);
    const mode = host.querySelector('input[name="demo-mode"]:checked').value;
    charts.innerHTML = selectedCharts(data.categories[selected] || data.overall, data, mode);
    return { selected, mode };
  };
  const updateTable = ({ selected, mode }) => {
    const scroll = table.firstElementChild?.scrollLeft || 0;
    table.innerHTML = comparisonTable(data, selected, mode);
    table.firstElementChild.scrollLeft = scroll;
  };
  const highlightSelection = (selected) => {
    table.querySelectorAll("[data-group]").forEach((button) => {
      const active = Number(button.dataset.group) === selected;
      button.setAttribute("aria-pressed", String(active));
      button.closest("tr").classList.toggle("demo-selected", active);
    });
  };
  updateTable(updateCharts());
  host.addEventListener("change", (event) => {
    const state = updateCharts();
    if (event.target === select) highlightSelection(state.selected);
    else updateTable(state);
  });
  host.addEventListener("click", (event) => {
    const button = event.target.closest("[data-group]");
    if (!button) return;
    select.value = button.dataset.group;
    highlightSelection(updateCharts().selected);
  });
  const showAgeDetail = (event) => {
    if (event.type === "pointerover" && charts.querySelector(".demo-bar-target:focus-visible")) return;
    const value = event.target.closest("[data-chart-detail]")?.dataset.chartDetail;
    if (value) charts.querySelector("[data-age-detail]").textContent = value;
  };
  charts.addEventListener("focusin", showAgeDetail);
  charts.addEventListener("pointerover", showAgeDetail);
  charts.addEventListener("click", showAgeDetail);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      charts.classList.add("demo-visible");
      observer.disconnect();
    }, { threshold: 0.1 });
    observer.observe(charts);
  }
}

export async function mountDemographics(section, url) {
  section.innerHTML = `<header class="demo-header">
    <div><span class="demo-eyebrow" lang="en">CASE DEMOGRAPHICS</span>
      <h2>${t("按诊断查看年龄与性别", "Age and gender by diagnosis")}</h2>
      <p>${t("比较不同诊断类别的病例构成，查看各组的年龄与性别分布。", "Compare the age and gender distributions of cases across diagnosis categories.")}</p></div>
  </header><div class="demo-body" aria-busy="true"><p role="status">${t("正在加载年龄和性别统计", "Loading age and gender statistics")}…</p></div>`;
  const host = section.querySelector(".demo-body");
  try {
    const data = await fetchDemographics(url);
    if (!section.isConnected) return;
    if (!data.overall.count) {
      host.innerHTML = `<p class="demo-empty" role="status">${t("暂无入库病例可供统计。", "No case records available for analysis.")}</p>`;
      return;
    }
    renderExplorer(host, data);
  } catch {
    host.innerHTML = `<p class="demo-empty" role="status">${t("暂时无法加载年龄与性别统计，请刷新页面重试。", "Age and gender statistics are temporarily unavailable. Refresh to try again.")}</p>`;
  } finally {
    host.removeAttribute("aria-busy");
  }
}
