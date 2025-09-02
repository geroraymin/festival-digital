/**
 * Supabase 클라이언트 설정
 * 중앙화된 Supabase 인스턴스 관리
 */

// Supabase 설정
const SUPABASE_URL = 'https://jxvctchiwgbduzlkvohg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4dmN0Y2hpd2diZHV6bGt2b2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNDcyNTcsImV4cCI6MjA3MTkyMzI1N30.OhO0vURBMgpcbHN8o9_lVvKKfzsaw10jL7kyAIUlVOI';

// Supabase 클라이언트 초기화 (라이브러리 미로딩 대비)
const supabaseLib = typeof window !== 'undefined' ? window.supabase : undefined;
export const supabase = supabaseLib ? supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/**
 * Supabase 인스턴스 가져오기
 * - Mock 모드가 활성화되어 있으면 null 반환
 */
export function getSupabase() {
    try {
        if (isInMockMode()) return null;
        if (!supabase) return null;
        return supabase;
    } catch (e) {
        return null;
    }
}

/**
 * Supabase 연결 상태 확인
 */
export async function checkSupabaseConnection() {
    try {
        const { data, error } = await supabase
            .from('booths')
            .select('count')
            .limit(1);
        
        return !error;
    } catch (error) {
        console.error('Supabase 연결 확인 실패:', error);
        return false;
    }
}

/**
 * Mock 모드 확인
 */
export function isInMockMode() {
    // localStorage에서 mock 모드 설정 확인
    return localStorage.getItem('useMockMode') === 'true';
}

/**
 * Mock 모드 설정
 */
export function setMockMode(enabled) {
    localStorage.setItem('useMockMode', enabled ? 'true' : 'false');
}