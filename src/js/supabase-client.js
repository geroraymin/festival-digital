/**
 * Supabase 클라이언트 설정
 * 중앙화된 Supabase 인스턴스 관리
 */

// Supabase 설정
const SUPABASE_URL = 'https://jxvctchiwgbduzlkvohg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4dmN0Y2hpd2diZHV6bGt2b2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU0MDY2MzQsImV4cCI6MjA1MDk4MjYzNH0.5MqGRA7kQbyPHDaVEA5D68R5M8J8zTThQWRi-5Xh2n0';

// Supabase 클라이언트 초기화
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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