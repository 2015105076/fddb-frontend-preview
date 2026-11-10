const siteRoot = new URL("../", import.meta.url);
const vowels = [..."aoeiuv"];
const translate = window.VoiceLanguage.t;
let dataset;

export const session = Object.freeze({ token: null, clear() {} });

export function apiUrl(path) {
  const asset = path === "/api/v1/demographics" ? "demo/demographics.json" : path;
  return new URL(asset, siteRoot).href;
}

async function loadDataset() {
  const response = await fetch(apiUrl("demo/cases.json"));
  if (!response.ok) throw new Error(translate("示例数据加载失败。", "Could not load the demo data."));
  return response.json();
}

function listCases(items, filters) {
  const search = (filters.get("search") || "").trim().toLowerCase();
  const diagnosis = filters.get("diagnosis");
  const gender = filters.get("gender");
  const from = filters.get("created_from");
  const to = filters.get("created_to");
  const page = Math.max(1, Number.parseInt(filters.get("page"), 10) || 1);
  const perPage = Math.min(200, Math.max(1, Number.parseInt(filters.get("per_page"), 10) || 30));
  if (from && to && from > to) {
    throw new Error(translate("开始日期不能晚于结束日期。", "The start date must precede or match the end date."));
  }
  const matching = items.filter((item) =>
    item.voice_id.toLowerCase().includes(search) &&
    (!diagnosis || item.diagnosis_label === diagnosis) &&
    (!gender || item.gender === gender) &&
    (!from || item.created_at >= from) &&
    (!to || item.created_at <= to));
  return {
    items: matching.slice((page - 1) * perPage, page * perPage),
    pagination: { page, total: matching.length, pages: Math.max(1, Math.ceil(matching.length / perPage)) },
  };
}

function audioAnalysis(audio) {
  const pitch = audio.f0_mean_hz;
  return {
    vowel: audio.vowel,
    metadata: { sample_rate_hz: audio.sample_rate, duration_sec: audio.duration_sec, channels: 1 },
    metrics: {
      f0: { mean_hz: pitch, min_hz: pitch, max_hz: pitch, std_hz: 0 },
      perturbation: {}, noise: {}, intensity: {}, formants: {}, spectrum: {}, cepstrum: {}, time: {},
    },
  };
}

export async function request(path, { method = "GET" } = {}) {
  if (method !== "GET") throw readOnlyError();
  dataset ??= loadDataset().catch((error) => {
    dataset = null;
    throw error;
  });
  const { items, labels, audio } = await dataset;
  const cases = items.map((item) => ({
    ...item,
    audio_count: item.audio_ids.length,
    complete_vowels: item.audio_ids.length === vowels.length,
  }));
  const [pathname, query] = path.split("?");
  if (pathname === "/api/v1/stats") {
    return {
      total_cases: cases.length,
      total_audio_files: cases.reduce((total, item) => total + item.audio_count, 0),
      complete_cases: cases.filter((item) => item.complete_vowels).length,
      diagnoses: labels.map((label) => ({
        code: label.label_code, name: label.label_name_cn, name_en: label.label_name_en, count: label.case_count,
      })),
    };
  }
  if (pathname === "/api/v1/labels") return { items: labels };
  if (pathname === "/api/v1/cases") return listCases(cases, new URLSearchParams(query));
  const detail = pathname.match(/^\/api\/v1\/cases\/([^/]+)(?:\/audio\/(\d+)\/analysis)?$/);
  if (detail) {
    const item = cases.find((row) => row.voice_id === decodeURIComponent(detail[1]));
    if (item) {
      const audioFiles = audio.filter((file) => item.audio_ids.includes(file.id));
      if (!detail[2]) return {
        ...item,
        audio_files: audioFiles,
        missing_vowels: vowels.filter((vowel) => !audioFiles.some((file) => file.vowel === vowel)),
        remark: translate("此病例及音频均为合成示例。", "This case and its audio are synthetic examples."),
      };
      const file = audioFiles.find((entry) => entry.id === Number(detail[2]));
      if (file) return audioAnalysis(file);
    }
  }
  throw new Error(translate("未找到该示例记录。", "The demo record was not found."));
}

function readOnlyError() {
  return new Error(translate("公开预览仅支持浏览。", "This public preview is read-only."));
}

export async function download() {
  throw readOnlyError();
}
