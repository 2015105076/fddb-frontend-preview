import { apiUrl, download, request, session } from "./api.js";
import { homePage, homeStatistics, homeStatisticsUnavailable } from "./home.js?v=diagnosis-demographics";
import { mountDemographics } from "../demographics/demographics.js";

const { language, name: databaseName, t, picker } = window.VoiceLanguage;
const app = document.querySelector("#app");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[char]);
const genderText = { male: t("男", "Male"), female: t("女", "Female"), unknown: t("未知", "Unknown") };
const isAdmin = () => Boolean(session.token);
const route = () => location.hash.replace(/^#/, "") || "/";
const link = (path, text, extra = "") => `<a href="#${path}" ${extra}>${text}</a>`;

function layout(content, active = "") {
  app.innerHTML = `<div class="shell"><header class="topbar"><a class="brand" href="#/">${databaseName}</a><nav class="nav">
    ${link("/", t("概览", "Overview"), active === "home" ? 'class="active"' : "")}
    ${link("/cases", t("病例", "Cases"), active === "cases" ? 'class="active"' : "")}
    ${link("/labels", t("诊断标签", "Diagnosis labels"), active === "labels" ? 'class="active"' : "")}
    ${isAdmin() ? `${link("/quality", t("质量审核", "Quality review"), active === "quality" ? 'class="active"' : "")}${link("/training", t("训练导出", "Training export"), active === "training" ? 'class="active"' : "")}` : ""}
    ${isAdmin() ? `<button class="btn small" data-action="logout">${t("退出管理", "Sign out")}</button>` : link("/login", t("管理登录", "Admin sign-in"), active === "login" ? 'class="active"' : "")}
      ${picker()}
  </nav></header><main class="main"><p class="notice" role="note">${t("界面预览 · 病例与音频均为合成示例", "Interface preview · Synthetic cases and audio")}</p>${content}</main></div>`;
}

function error(message) { return `<div class="error">${escapeHtml(message)}</div>`; }
function stat(value, label) { return `<article class="card"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></article>`; }
function caseName(item, english = item.diagnosis_name_en) {
  return escapeHtml(t(item.diagnosis_name, english || item.diagnosis_name) || item.diagnosis_label || t("未标注", "Unlabeled"));
}
function labelOptionName(label) {
  const chinese = label.label_name_cn || label.label_code;
  return escapeHtml(t(chinese, label.label_name_en || chinese));
}
function queryString(params) { return new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "" && value != null)).toString(); }
function remarkFields(fields) {
  return fields.filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value]) => `<dl><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></dl>`).join("");
}
function caseRemark(remark) {
  if (!remark) return "";
  try {
    const payload = JSON.parse(remark);
    if (!payload.import_batch) throw new Error(t("普通备注", "Plain note"));
    const record = payload.admission_record;
    const matched = Boolean(payload.pathology_record_matched && record);
    const importFields = [[t("导入批次", "Import batch"), payload.import_batch], [t("患者姓名", "Patient name"), record?.["姓名"] || payload.patient_name], [t("病理记录", "Pathology record"), matched ? t("已匹配", "Matched") : t("未匹配", "Unmatched")]];
    const profileFields = record ? [[t("性别", "Gender"), record["性别"]], [t("年龄", "Age"), record["年龄"] ? `${record["年龄"]} ${t("岁", "years")}` : ""], [t("籍贯", "Place of origin"), record["籍贯"]], [t("职业", "Occupation"), record["职业"]], [t("吸烟史", "Smoking history"), record["吸烟史"]], [t("是否戒烟", "Quit smoking"), record["是否戒烟"]], [t("饮酒史", "Alcohol use history"), record["饮酒史"]], [t("是否戒酒", "Quit drinking"), record["是否戒酒"]]] : [];
    const recordFields = record ? [[t("初步诊断", "Preliminary diagnosis"), record["初步诊断"]], [t("主治医师诊断", "Attending physician diagnosis"), record["主治医师诊断"]], [t("入院记录 PDF", "Admission record PDF"), record["PDF路径"]], [t("解析状态", "Parsing status"), record["解析状态"]], [t("缺失字段", "Missing fields"), record["缺失字段"]], [t("处理说明", "Processing notes"), record["处理说明"]]] : [];
    return `<section class="case-remark structured-remark"><div class="section-heading"><h2>${t("备注", "Notes")}</h2><span class="badge ${matched ? "remark-matched" : "remark-unmatched"}">${matched ? t("已匹配入院记录", "Admission record matched") : t("未匹配入院记录", "No admission record matched")}</span></div><div class="remark-groups"><section class="remark-group"><h3>${t("导入信息", "Import details")}</h3><div class="remark-grid">${remarkFields(importFields)}</div></section>${profileFields.length ? `<section class="remark-group"><h3>${t("基础信息与病史", "Profile and medical history")}</h3><div class="remark-grid">${remarkFields(profileFields)}</div></section>` : ""}${recordFields.length ? `<section class="remark-group"><h3>${t("入院记录与解析提示", "Admission record and parsing notes")}</h3><div class="remark-grid">${remarkFields(recordFields)}</div></section>` : ""}</div></section>`;
  } catch (_) {
    return `<section class="case-remark"><h2>${t("备注", "Notes")}</h2><p class="muted plain-remark">${escapeHtml(remark)}</p></section>`;
  }
}

async function home() {
  layout(homePage({ casesUrl: "#/cases", secondaryUrl: "#/labels", secondaryLabel: t("查看诊断标签", "View diagnosis labels") }), "home");
  mountDemographics(document.querySelector("#diagnosis-demographics"), apiUrl("/api/v1/demographics"));
  const host = document.querySelector("#home-statistics");
  try {
    const data = await request("/api/v1/stats");
    if (!host.isConnected) return;
    host.innerHTML = homeStatistics({
      totalCases: data.total_cases,
      totalAudio: data.total_audio_files,
      completeCases: data.complete_cases,
      diagnoses: data.diagnoses,
    });
  } catch {
    homeStatisticsUnavailable(host);
  } finally {
    host.removeAttribute("aria-busy");
  }
}

async function cases() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const search = params.get("search") || ""; const diagnosis = params.get("diagnosis") || ""; const gender = params.get("gender") || ""; const createdFrom = params.get("created_from") || ""; const createdTo = params.get("created_to") || ""; const perPage = params.get("per_page") || "30"; const page = Number(params.get("page") || 1);
  layout(`<div class="actions"><h1>${t("病例目录", "Case directory")}</h1>${isAdmin() ? `<a class="btn success" href="#/cases/new">${t("新增病例", "Add case")}</a>` : ""}</div><section class="card"><form id="case-filter" class="filter"><input class="field" name="search" placeholder="${t("按 Voice ID 搜索", "Search by voice ID")}" value="${escapeHtml(search)}"><select class="field" name="diagnosis"><option value="">${t("全部诊断", "All diagnoses")}</option></select><select class="field" name="gender"><option value="">${t("全部性别", "All genders")}</option>${Object.entries(genderText).map(([key, name]) => `<option value="${key}" ${gender === key ? "selected" : ""}>${name}</option>`).join("")}</select><div class="filter-date-range" role="group" aria-label="${t("入库时间", "Date added")}"><span>${t("入库时间", "Date added")}</span><input class="field" type="date" name="created_from" aria-label="${t("入库开始日期", "Start date added")}" value="${escapeHtml(createdFrom)}"><span>${t("至", "to")}</span><input class="field" type="date" name="created_to" aria-label="${t("入库结束日期", "End date added")}" value="${escapeHtml(createdTo)}"></div><select class="field" name="per_page"><option value="30" ${perPage === "30" ? "selected" : ""}>30 ${t("条/页", " per page")}</option><option value="50" ${perPage === "50" ? "selected" : ""}>50 ${t("条/页", " per page")}</option><option value="100" ${perPage === "100" ? "selected" : ""}>100 ${t("条/页", " per page")}</option></select><button class="btn primary">${t("查询", "Search")}</button></form></section><div id="case-list" class="empty">${t("正在加载病例", "Loading cases")}…</div>`, "cases");
  try {
    const labels = await request("/api/v1/labels");
    const englishNames = new Map(labels.items.map((label) => [label.label_code, label.label_name_en]));
    const select = document.querySelector('[name="diagnosis"]');
    select.insertAdjacentHTML("beforeend", labels.items.map((item) => `<option value="${escapeHtml(item.label_code)}" ${diagnosis === item.label_code ? "selected" : ""}>${labelOptionName(item)}</option>`).join(""));
    const data = await request(`/api/v1/cases?${queryString({ page, search, diagnosis, gender, created_from: createdFrom, created_to: createdTo, per_page: perPage })}`);
    const rows = data.items.map((item) => {
      const english = englishNames.get(item.diagnosis_label);
      const diagnosisName = caseName(item, english);
      return `<tr><td><a href="#/cases/${encodeURIComponent(item.voice_id)}"><strong>${escapeHtml(item.voice_id)}</strong></a></td><td>${diagnosisName}</td><td>${genderText[item.gender]}</td><td>${item.age ?? "-"}</td><td class="${item.complete_vowels ? "complete" : "incomplete"}">${item.audio_count}</td><td>${item.created_at ? new Date(item.created_at).toLocaleDateString(language) : "-"}</td></tr>`;
    }).join("");
    document.querySelector("#case-list").outerHTML = `<section id="case-list" class="card"><p class="muted">${t(`共 ${data.pagination.total} 条记录`, `${data.pagination.total} records`)}</p><div class="table-wrap"><table><thead><tr><th>Voice ID</th><th>${t("诊断", "Diagnosis")}</th><th>${t("性别", "Gender")}</th><th>${t("年龄", "Age")}</th><th>${t("音频条数", "Audio files")}</th><th>${t("创建时间", "Created at")}</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty">${t("没有匹配的病例", "No matching cases")}</td></tr>`}</tbody></table></div><div class="pagination"><button class="btn small" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>${t("上一页", "Previous")}</button><span class="muted">${t(`第 ${data.pagination.page}/${data.pagination.pages} 页`, `Page ${data.pagination.page} of ${data.pagination.pages}`)}</span><button class="btn small" data-page="${page + 1}" ${page >= data.pagination.pages ? "disabled" : ""}>${t("下一页", "Next")}</button></div></section>`;
  } catch (err) { document.querySelector("#case-list").innerHTML = error(err.message); }
}

function caseForm(caseData = {}, labels = []) {
  const field = (name, label, type = "text", wide = false) => `<label class="${wide ? "wide" : ""}">${label}<input class="field" ${type === "number" ? 'min="0" max="120"' : ""} type="${type}" name="${name}" value="${escapeHtml(caseData[name] ?? "")}"></label>`;
  return `<form id="case-form" class="card"><div class="form-grid">${field("voice_id", "Voice ID *", "text")}${field("age", t("年龄", "Age"), "number")}
    <label>${t("性别", "Gender")}<select class="field" name="gender">${Object.entries(genderText).map(([key, name]) => `<option value="${key}" ${caseData.gender === key || (!caseData.gender && key === "unknown") ? "selected" : ""}>${name}</option>`).join("")}</select></label>
    <label>${t("采集日期", "Collection date")}<input class="field" type="date" name="collection_date" value="${escapeHtml(caseData.collection_date ?? "")}"></label>
    <label>${t("诊断标签", "Diagnosis labels")}<select class="field" name="diagnosis_label"><option value="">${t("请选择", "Select an option")}</option>${labels.map((item) => `<option value="${escapeHtml(item.label_code)}" ${caseData.diagnosis_label === item.label_code ? "selected" : ""}>${labelOptionName(item)}</option>`).join("")}</select></label>${field("diagnosis_name", t("诊断名称", "Diagnosis name"))}${field("source_hospital", t("来源医院", "Source hospital"), "text", true)}
    <label class="wide">${t("备注", "Notes")}<textarea class="field" rows="4" name="remark">${escapeHtml(caseData.remark ?? "")}</textarea></label></div><div class="actions"><button class="btn primary">${caseData.voice_id ? t("保存修改", "Save changes") : t("创建病例", "Create case")}</button><a class="btn" href="#/cases">${t("取消", "Cancel")}</a></div></form>`;
}

async function newCase() {
  if (!isAdmin()) return login(t("需要先登录管理员账户。", "Sign in as an administrator to continue."));
  layout(`<h1>${t("新增病例", "Add case")}</h1><div id="case-form-host" class="empty">${t("加载表单", "Loading form")}…</div>`, "cases");
  try { const labels = await request("/api/v1/labels"); document.querySelector("#case-form-host").outerHTML = caseForm({}, labels.items); } catch (err) { document.querySelector("#case-form-host").innerHTML = error(err.message); }
}

async function caseDetail(voiceId) {
  layout(`<div id="case-detail" class="empty">${t("正在加载病例", "Loading cases")}…</div>`, "cases");
  try {
    const item = await request(`/api/v1/cases/${encodeURIComponent(voiceId)}`);
    const editor = isAdmin() ? `<div class="actions"><a class="btn" href="#/cases/${encodeURIComponent(item.voice_id)}/edit">${t("编辑病例", "Edit case")}</a><button class="btn danger" data-delete-case="${escapeHtml(item.voice_id)}">${t("删除病例", "Delete case")}</button></div>` : "";
    const audioRows = item.audio_files.map((audio) => `<tr><td><strong>${audio.vowel}</strong></td><td><audio controls preload="none" src="${apiUrl(audio.url)}"></audio></td><td>${escapeHtml(audio.file_name)}</td><td>${audio.sample_rate || "-"} Hz</td><td>${audio.duration_sec?.toFixed(2) || "-"} s</td><td>${audio.snr_db ?? "-"} dB</td><td>${audio.f0_mean_hz ?? "-"} / ${audio.f0_std_hz ?? "-"} Hz</td><td><span class="badge">${audio.quality_status}</span><br><small class="muted">${escapeHtml(audio.quality_reviewer || t("待审核", "Pending review"))}</small></td><td><a class="btn small" href="#/cases/${encodeURIComponent(item.voice_id)}/audio/${audio.id}">${t("波形与指标", "Waveform and measures")}</a>${isAdmin() ? ` <a class="btn small" href="#/quality">${t("审核", "Review")}</a><button class="btn danger small" data-delete-audio="${audio.id}">${t("删除", "Delete")}</button>` : ""}</td></tr>`).join("");
    document.querySelector("#case-detail").outerHTML = `<div id="case-detail"><a href="#/cases">← ${t("返回病例目录", "Back to case directory")}</a><div class="actions"><h1>${escapeHtml(item.voice_id)}</h1></div>${editor}<section class="card"><div class="grid detail-grid"><dl><dt>${t("诊断", "Diagnosis")}</dt><dd>${caseName(item)}</dd></dl><dl><dt>${t("性别 / 年龄", "Gender / Age")}</dt><dd>${genderText[item.gender]} / ${item.age ?? "-"}</dd></dl><dl><dt>${t("采集日期", "Collection date")}</dt><dd>${item.collection_date || "-"}</dd></dl><dl><dt>${t("来源医院", "Source hospital")}</dt><dd>${escapeHtml(item.source_hospital || "-")}</dd></dl><dl><dt>${t("元音完整度", "Vowel completeness")}</dt><dd class="${item.complete_vowels ? "complete" : "incomplete"}">${item.complete_vowels ? t("完整", "Complete") : `${t("缺失", "Missing")} ${item.missing_vowels.join(", ")}`}</dd></dl></div>${caseRemark(item.remark)}</section><section class="card"><h2>${t("音频文件", "Audio files")}</h2><div class="table-wrap"><table><thead><tr><th>${t("元音", "vowels")}</th><th>${t("播放", "Playback")}</th><th>${t("文件名", "File name")}</th><th>${t("采样率", "Sample rate")}</th><th>${t("时长", "Duration")}</th><th>SNR</th><th>F0 ${t("均值 / 标准差", "Mean / SD")}</th><th>${t("质量", "Quality")}</th><th>${t("操作", "Actions")}</th></tr></thead><tbody>${audioRows || `<tr><td colspan="9" class="empty">${t("暂无音频", "No audio")}</td></tr>`}</tbody></table></div>${isAdmin() ? audioForm(item.voice_id) : ""}</section></div>`;
  } catch (err) { document.querySelector("#case-detail").innerHTML = error(err.message); }
}

const analysisNumber = (value, unit = "") => value == null ? "-" : `${Number(value).toFixed(3)}${unit ? ` ${unit}` : ""}`;
const analysisGroup = (title, entries) => `<section><h3>${title}</h3><dl>${entries.map(([label, value, unit]) => `<dt>${label}</dt><dd>${analysisNumber(value, unit)}</dd>`).join("")}</dl></section>`;

async function drawAnalysisWaveform(canvas, url) {
  const context = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = await (await fetch(apiUrl(url))).arrayBuffer();
  const decoded = await context.decodeAudioData(buffer); const samples = decoded.getChannelData(0);
  const ratio = window.devicePixelRatio || 1; const width = Math.max(320, Math.floor(canvas.clientWidth * ratio)); const height = 150 * ratio;
  canvas.width = width; canvas.height = height; const pen = canvas.getContext("2d"); pen.fillStyle = "#f4f8fb"; pen.fillRect(0, 0, width, height); pen.strokeStyle = "#17658a"; pen.beginPath();
  const stride = Math.max(1, Math.floor(samples.length / width)); for (let x = 0; x < width; x += 1) { const segment = samples.subarray(x * stride, Math.min((x + 1) * stride, samples.length)); let min = 1, max = -1; for (const sample of segment) { min = Math.min(min, sample); max = Math.max(max, sample); } pen.moveTo(x, (1 + min) * height / 2); pen.lineTo(x, (1 + max) * height / 2); } pen.stroke(); await context.close();
}

async function audioAnalysis(voiceId, audioId) {
  layout(`<div id="audio-analysis" class="empty">${t("正在提取", "Extracting")} /${escapeHtml(audioId)}/ ${t("的 Parselmouth/Praat 指标", " Parselmouth/Praat measures")}…</div>`, "cases");
  try {
    const [caseData, data] = await Promise.all([request(`/api/v1/cases/${encodeURIComponent(voiceId)}`), request(`/api/v1/cases/${encodeURIComponent(voiceId)}/audio/${audioId}/analysis`)]);
    const audio = caseData.audio_files.find((item) => item.id === Number(audioId)); const m = data.metrics;
    document.querySelector("#audio-analysis").outerHTML = `<div id="audio-analysis"><a href="#/cases/${encodeURIComponent(voiceId)}">← ${t("返回", "Back")} ${escapeHtml(voiceId)}</a><section class="card"><h1>/${escapeHtml(data.vowel)}/ ${t("波形与声学指标", "Waveform and acoustic measures")}</h1><p class="muted">${t("采样率", "Sample rate")} ${data.metadata.sample_rate_hz} Hz · ${t("时长", "Duration")} ${analysisNumber(data.metadata.duration_sec, "s")} · ${data.metadata.channels} ${t("声道", "channels")}</p><audio controls src="${apiUrl(audio.url)}"></audio><canvas class="waveform"></canvas><div class="analysis-grid">${analysisGroup(t("基频 F0", "Fundamental frequency F0"), [["Mean F0",m.f0.mean_hz,"Hz"],[t("F0 标准差", "F0 SD"),m.f0.std_hz,"Hz"],[t("最小 / 最大 F0", "Minimum / maximum F0"),m.f0.min_hz,"Hz"],[t("最大 F0", "Maximum F0"),m.f0.max_hz,"Hz"]])}${analysisGroup(t("微扰", "Perturbation"), [["Jitter",m.perturbation.jitter_local_percent,"%"],["Shimmer",m.perturbation.shimmer_local_percent,"%"]])}${analysisGroup(t("噪声", "Noise"), [["HNR",m.noise.hnr_db,"dB"],["NHR",m.noise.nhr_ratio,""]])}${analysisGroup(t("强度", "Intensity"), [[t("平均", "Mean"),m.intensity.mean_db,"dB"],[t("最小", "Minimum"),m.intensity.min_db,"dB"],[t("最大", "Maximum"),m.intensity.max_db,"dB"]])}${analysisGroup(t("共振峰", "Formants"), [["F1",m.formants.f1_mean_hz,"Hz"],["F2",m.formants.f2_mean_hz,"Hz"],["F3",m.formants.f3_mean_hz,"Hz"],["F4",m.formants.f4_mean_hz,"Hz"]])}${analysisGroup(t("频谱", "Spectrum"), [[t("谱倾斜", "Spectral tilt"),m.spectrum.spectral_tilt_db_per_khz,"dB/kHz"],["H1–H2",m.spectrum.h1_h2_db,"dB"]])}${analysisGroup(t("倒谱", "Cepstrum"), [["CPP",m.cepstrum.cpp_db,"dB"],["CPPS",m.cepstrum.cpps_db,"dB"]])}${analysisGroup(t("时间", "Timing"), [[t("发声时长", "Phonation duration"),m.time.phonation_duration_sec,"s"],[t("MPT 估计", "MPT estimate"),m.time.mpt_estimate_sec,"s"]])}</div><p class="muted">MPT ${t("基于短时 RMS 静音检测估算，仅供研究分析，不构成临床诊断。", "is estimated from short-time RMS silence detection for research use only and is not a clinical diagnosis.")}</p></section></div>`;
    await drawAnalysisWaveform(document.querySelector(".waveform"), audio.url);
  } catch (err) { document.querySelector("#audio-analysis").innerHTML = error(err.message); }
}

function audioForm(voiceId) { return `<form id="audio-form" class="form-grid" style="margin-top:20px"><label>${t("元音", "vowels")}<select class="field" name="vowel">${["a", "o", "e", "i", "u", "v"].map((v) => `<option>${v}</option>`).join("")}</select></label><label>${t("服务器 WAV 完整路径", "Full WAV path on the server")}<input class="field" required name="file_path"></label><label>${t("显示文件名（可选）", "Display name (optional)")}<input class="field" name="file_name"></label><label>SNR${t("（dB，可选）", " (dB, optional)")}<input class="field" type="number" step="0.01" name="snr_db"></label><label>${t("平均 F0（Hz，可选）", "Mean F0 (Hz, optional)")}<input class="field" type="number" min="0" step="0.01" name="f0_mean_hz"></label><label>F0 ${t("标准差（Hz，可选）", "SD (Hz, optional)")}<input class="field" type="number" min="0" step="0.01" name="f0_std_hz"></label><div class="actions"><button class="btn primary">${t("添加音频", "Add audio")}</button></div></form>`; }

async function quality() {
  if (!isAdmin()) return login(t("需要先登录管理员账户。", "Sign in as an administrator to continue."));
  const selectedStatus = new URLSearchParams(location.hash.split("?")[1] || "").get("status") || "unchecked";
  layout(`<div class="actions"><h1>${t("音频质量审核", "Audio quality review")}</h1><select id="quality-filter" class="field" style="width:auto"><option value="unchecked" ${selectedStatus === "unchecked" ? "selected" : ""}>${t("待审核", "Pending review")}</option><option value="valid" ${selectedStatus === "valid" ? "selected" : ""}>${t("已合格", "Accepted")}</option><option value="invalid" ${selectedStatus === "invalid" ? "selected" : ""}>${t("不合格", "Rejected")}</option></select>${selectedStatus === "unchecked" ? `<button class="btn primary" data-bulk-approve-unchecked>${t("一键审核全部待审音频", "Accept all pending audio")}</button>` : ""}</div><div id="quality-queue" class="empty">${t("正在加载审核任务", "Loading review queue")}…</div>`, "quality");
  try {
    const data = await request(`/api/v1/quality/review-queue?quality_status=${selectedStatus}`, { admin:true });
    document.querySelector("#quality-queue").outerHTML = `<section id="quality-queue" class="card"><p class="muted">${t("共", "Total: ")} ${data.pagination.total} ${t("段音频。审核会记录审核人、备注及历史。", " audio files. The reviewer, notes, and review history will be recorded.")}</p><div class="table-wrap"><table><thead><tr><th>${t("病例", "Cases")}</th><th>${t("元音", "vowels")}</th><th>${t("播放", "Playback")}</th><th>${t("当前状态", "Current status")}</th><th>${t("审核结果", "Review result")}</th></tr></thead><tbody>${data.items.map((audio) => `<tr><td><a href="#/cases/${encodeURIComponent(audio.voice_id)}">${escapeHtml(audio.voice_id)}</a></td><td>${audio.vowel}</td><td><audio controls preload="none" src="${apiUrl(audio.url)}"></audio></td><td>${audio.quality_status}</td><td><form class="quality-review-form" data-voice-id="${escapeHtml(audio.voice_id)}" data-audio-id="${audio.id}"><select class="field" name="quality_status"><option value="valid">${t("合格", "Accepted")}</option><option value="invalid">${t("不合格", "Rejected")}</option><option value="unchecked">${t("继续待审", "Keep pending")}</option></select><input class="field" required name="reviewer" placeholder="${t("审核人", "Reviewer")}"><input class="field" name="remark" placeholder="${t("审核备注（可选）", "Review notes (optional)")}"><button class="btn primary small">${t("提交审核", "Submit review")}</button></form></td></tr>`).join("") || `<tr><td colspan="5" class="empty">${t("没有该状态的音频", "No audio with this status")}</td></tr>`}</tbody></table></div></section>`;
  } catch (err) { document.querySelector("#quality-queue").innerHTML = error(err.message); }
}

async function training() {
  if (!isAdmin()) return login(t("需要先登录管理员账户。", "Sign in as an administrator to continue."));
  layout(`<h1>${t("深度学习训练集", "Deep learning training set")}</h1><div id="training" class="empty">${t("正在加载标签分布", "Loading label distribution")}…</div>`, "training");
  try {
    const [summary, labels] = await Promise.all([request("/api/v1/training/summary", { admin:true }), request("/api/v1/labels")]);
    const labelNames = new Map(labels.items.map((label) => [label.label_code, label.label_name_cn || label.label_code]));
    const distribution = Object.entries(summary.label_distribution).map(([label, count]) => {
      const available = summary.eligible_complete_cases_by_label[label] || 0;
      return `<tr><td>${escapeHtml(labelNames.get(label) || label)}</td><td>${count}</td><td>${available}</td><td><input class="field" style="width:100px" type="number" min="0" max="${available}" value="${available}" data-label-case-count="${escapeHtml(label)}"></td></tr>`;
    }).join("");
    document.querySelector("#training").outerHTML = `<div id="training"><section class="grid stats">${stat(summary.statistics.total_cases, t("总病例", "Total cases"))}${stat(summary.statistics.total_audio_files, t("总音频", "Total audio"))}${stat(summary.statistics.complete_cases, t("完整病例", "Complete cases"))}</section><form id="training-export-form" class="card"><h2>${t("选择每类导出病例数量", "Select the number of cases to export per label")}</h2><div class="table-wrap"><table><thead><tr><th>${t("标签", "Label")}</th><th>${t("病例数", "Cases")}</th><th>${t("可导出完整病例", "Complete cases available")}</th><th>${t("导出病例数", "Cases to export")}</th></tr></thead><tbody>${distribution || `<tr><td colspan="4" class="empty">${t("暂无数据", "No data")}</td></tr>`}</tbody></table></div><div class="form-grid" style="margin-top:20px"><label>${t("音频质量", "Audio quality")}<select class="field" name="quality_status"><option value="valid">${t("仅合格", "Accepted only")}</option><option value="all">${t("全部状态", "All statuses")}</option><option value="unchecked">${t("仅待审核", "Pending only")}</option><option value="invalid">${t("仅不合格", "Rejected only")}</option></select></label><label><input type="checkbox" name="complete_cases_only" checked> ${t("仅导出元音完整病例", "Export only cases with all six vowels")}</label></div><div class="actions"><button class="btn primary">${t("下载 CSV 清单", "Download CSV manifest")}</button></div><p class="muted">${t("数量以病例计：每个选中病例会导出其所有符合筛选条件的元音音频。系统按 Voice ID 稳定排序选择，导出不会复制原始音频文件。", "Counts are per case. Each selected case includes every vowel recording that matches the filters. Cases are selected in voice ID order, and the export does not copy the original audio.")}</p></form></div>`;
  } catch (err) { document.querySelector("#training").innerHTML = error(err.message); }
}

async function editCase(voiceId) {
  if (!isAdmin()) return login(t("需要先登录管理员账户。", "Sign in as an administrator to continue."));
  layout(`<h1>${t("编辑病例", "Edit case")}</h1><div id="case-form-host" class="empty">${t("加载表单", "Loading form")}…</div>`, "cases");
  try { const [item, labels] = await Promise.all([request(`/api/v1/cases/${encodeURIComponent(voiceId)}`), request("/api/v1/labels")]); const form = caseForm(item, labels.items); document.querySelector("#case-form-host").outerHTML = form.replace('name="voice_id"', 'name="voice_id" readonly'); } catch (err) { document.querySelector("#case-form-host").innerHTML = error(err.message); }
}

async function labels() {
  layout(`<div class="actions"><h1>${t("诊断标签", "Diagnosis labels")}</h1></div><div id="labels" class="empty">${t("正在加载标签", "Loading labels")}…</div>`, "labels");
  try { const data = await request("/api/v1/labels"); document.querySelector("#labels").outerHTML = `<section id="labels" class="card"><div class="table-wrap"><table><thead><tr><th>${t("代码", "Code")}</th><th>${t("中文名称", "Chinese name")}</th><th>${t("英文名称", "English name")}</th><th>${t("病例数", "Cases")}</th>${isAdmin() ? `<th>${t("操作", "Actions")}</th>` : ""}</tr></thead><tbody>${data.items.map((label) => `<tr><td>${escapeHtml(label.label_code)}</td><td>${escapeHtml(label.label_name_cn || "-")}</td><td>${escapeHtml(label.label_name_en || "-")}</td><td>${label.case_count}</td>${isAdmin() ? `<td><button class="btn danger small" data-delete-label="${label.id}">${t("删除", "Delete")}</button></td>` : ""}</tr>`).join("")}</tbody></table></div>${isAdmin() ? `<form id="label-form" class="form-grid" style="margin-top:20px"><label>${t("代码", "Code")}<input class="field" required name="label_code"></label><label>${t("中文名", "Chinese name")}<input class="field" name="label_name_cn"></label><label>${t("英文名", "English name")}<input class="field" name="label_name_en"></label><div class="actions"><button class="btn primary">${t("添加标签", "Add label")}</button></div></form>` : ""}</section>`; } catch (err) { document.querySelector("#labels").innerHTML = error(err.message); }
}

function login() {
  layout(`<section class="login"><h1>${t("管理员登录", "Admin sign-in")}</h1><p class="notice">${t("此预览为只读，管理功能在完整系统中提供。", "This preview is read-only. Administration is available in the full system.")}</p></section>`, "login");
}

async function navigate() {
  const [path] = route().split("?"); const parts = path.split("/").filter(Boolean);
  if (!parts.length) return home();
  if (parts[0] === "cases" && parts[1] === "new") return newCase();
  if (parts[0] === "cases" && parts[2] === "audio" && parts[3]) return audioAnalysis(decodeURIComponent(parts[1]), Number(parts[3]));
  if (parts[0] === "cases" && parts[2] === "edit") return editCase(decodeURIComponent(parts[1]));
  if (parts[0] === "cases" && parts[1]) return caseDetail(decodeURIComponent(parts[1]));
  if (parts[0] === "cases") return cases(); if (parts[0] === "labels") return labels(); if (parts[0] === "quality") return quality(); if (parts[0] === "training") return training(); if (parts[0] === "login") return login(); return home();
}

document.addEventListener("submit", async (event) => {
  const form = event.target; if (!form.matches("#login-form, #case-filter, #case-form, #audio-form, #label-form, #training-export-form, .quality-review-form")) return; event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "login-form") { const result = await request("/api/v1/auth/login", { method:"POST", body:values }); session.token = result.access_token; location.hash = "#/"; return; }
    if (form.id === "case-filter") { location.hash = `#/cases?${queryString({ ...values, page:1 })}`; return; }
    if (form.id === "case-form") { const emptyToNull = (key) => values[key] = values[key] || null; ["age", "diagnosis_label", "diagnosis_name", "collection_date", "source_hospital", "remark"].forEach(emptyToNull); if (values.age) values.age = Number(values.age); const id = values.voice_id; const existing = route().includes("/edit"); await request(existing ? `/api/v1/cases/${encodeURIComponent(id)}` : "/api/v1/cases", { method:existing ? "PATCH" : "POST", body:existing ? Object.fromEntries(Object.entries(values).filter(([key]) => key !== "voice_id")) : values, admin:true }); location.hash = `#/cases/${encodeURIComponent(id)}`; return; }
    if (form.id === "audio-form") { const id = route().split("/")[2]; await request(`/api/v1/cases/${encodeURIComponent(id)}/audio`, { method:"POST", body:values, admin:true }); navigate(); return; }
    if (form.id === "label-form") { await request("/api/v1/labels", { method:"POST", body:values, admin:true }); navigate(); }
    if (form.classList.contains("quality-review-form")) { await request(`/api/v1/cases/${encodeURIComponent(form.dataset.voiceId)}/audio/${form.dataset.audioId}`, { method:"PATCH", body:values, admin:true }); navigate(); return; }
    if (form.id === "training-export-form") { const label_case_counts = Object.fromEntries([...form.querySelectorAll("[data-label-case-count]")].map((input) => [input.dataset.labelCaseCount, Number(input.value || 0)]).filter(([, count]) => count > 0)); if (!Object.keys(label_case_counts).length) throw new Error(t("请至少为一个标签填写大于 0 的导出病例数。", "Enter a case count greater than zero for at least one label.")); await download("/api/v1/training/export", "voice-training-manifest.csv", { method:"POST", body:{ label_case_counts, quality_status:values.quality_status, complete_cases_only:values.complete_cases_only === "on" } }); }
  } catch (err) { form.insertAdjacentHTML("beforebegin", error(err.message)); }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button"); if (!target) return;
  if (target.dataset.action === "logout") { session.clear(); location.hash = "#/"; return; }
  if (target.dataset.page) { const parameters = new URLSearchParams(location.hash.split("?")[1] || ""); parameters.set("page", target.dataset.page); location.hash = `#/cases?${parameters}`; return; }
  try {
    if (target.dataset.bulkApproveUnchecked !== undefined) {
      const reviewer = prompt(t("请输入本次批量审核的审核人：", "Enter the reviewer for this batch:"));
      if (reviewer === null) return;
      if (!reviewer.trim()) throw new Error(t("审核人不能为空。", "Reviewer is required."));
      const remark = prompt(t("审核备注（可选）：", "Review notes (optional):"), t("历史待审核音频批量标记为合格", "Marked previously unreviewed audio as accepted"));
      if (remark === null) return;
      if (!confirm(t("确认将数据库中全部待审核音频标记为合格？已有合格或不合格结果不会被修改。", "Mark all pending audio in the database as accepted? Previously reviewed results will be preserved."))) return;
      target.disabled = true;
      const result = await request("/api/v1/quality/bulk-approve-unchecked", { method:"POST", body:{ reviewer:reviewer.trim(), remark }, admin:true });
      alert(`${t("已将", "Marked")} ${result.reviewed_count} ${t("段待审核音频标记为合格，并写入审核历史。", " pending audio files as accepted and recorded the review.")}`);
      navigate();
      return;
    }
    const id = route().split("/")[2]; if (target.dataset.deleteCase && confirm(t("确定删除该病例及其音频？", "Delete this case and its audio?"))) { await request(`/api/v1/cases/${encodeURIComponent(target.dataset.deleteCase)}`, { method:"DELETE", admin:true }); location.hash = "#/cases"; } if (target.dataset.deleteAudio && confirm(t("确定删除该音频？", "Delete this audio file?"))) { await request(`/api/v1/cases/${encodeURIComponent(id)}/audio/${target.dataset.deleteAudio}`, { method:"DELETE", admin:true }); navigate(); } if (target.dataset.deleteLabel && confirm(t("确定删除该标签？", "Delete this label?"))) { await request(`/api/v1/labels/${target.dataset.deleteLabel}`, { method:"DELETE", admin:true }); navigate(); }
  } catch (err) { alert(err.message); }
});

document.addEventListener("change", async (event) => { if (event.target.id !== "quality-filter") return; location.hash = `#/quality?status=${event.target.value}`; });
window.addEventListener("hashchange", navigate); navigate();
