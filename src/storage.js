// 필기 데이터 저장 - localStorage(즉시 표시용 캐시) + Supabase(클라우드 동기화)
import { supabase } from "./supabaseClient.js";

const STROKES_KEY = "ncs-masuri:strokes";

function loadAllLocal() {
  try {
    const raw = localStorage.getItem(STROKES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn("로컬 필기 데이터를 불러오지 못했습니다.", e);
    return {};
  }
}

function saveAllLocal(data) {
  try {
    localStorage.setItem(STROKES_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("로컬 필기 데이터를 저장하지 못했습니다.", e);
  }
}

// 즉시 화면에 그리기 위한 동기 캐시 로드
export function loadStrokes(problemId) {
  const all = loadAllLocal();
  return all[problemId] || [];
}

export function clearStrokes(problemId) {
  const all = loadAllLocal();
  delete all[problemId];
  saveAllLocal(all);
  supabase
    .from("strokes")
    .delete()
    .eq("problem_id", problemId)
    .then(({ error }) => {
      if (error) console.warn("클라우드 필기 삭제 실패", error);
    });
}

// 로컬에는 즉시 저장, Supabase에는 백그라운드로 동기화 (실패해도 로컬은 유지됨)
export function saveStrokes(problemId, strokes) {
  const all = loadAllLocal();
  all[problemId] = strokes;
  saveAllLocal(all);

  supabase
    .from("strokes")
    .upsert({ problem_id: problemId, data: strokes, updated_at: new Date().toISOString() }, { onConflict: "problem_id" })
    .then(({ error }) => {
      if (error) console.warn("클라우드 필기 저장 실패 (로컬에는 저장됨)", error);
    });
}

// 앱 시작 시 클라우드 데이터를 가져와서, 로컬 캐시보다 최신이면 반영
export async function syncFromCloud(problemIds, onUpdate) {
  try {
    const { data, error } = await supabase.from("strokes").select("problem_id, data").in("problem_id", problemIds);
    if (error) {
      console.warn("클라우드 동기화 실패 (로컬 데이터로 계속 진행)", error);
      return;
    }
    if (!data) return;
    const all = loadAllLocal();
    data.forEach((row) => {
      all[row.problem_id] = row.data || [];
    });
    saveAllLocal(all);
    onUpdate(all);
  } catch (e) {
    console.warn("클라우드 동기화 중 오류 (로컬 데이터로 계속 진행)", e);
  }
}
