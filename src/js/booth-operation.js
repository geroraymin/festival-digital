/**
 * 부스 운영 관리 모듈
 * 운영자 등록, 운영 시작/종료, 세션 관리
 */

import { getSupabase } from './supabase-client.js';

/**
 * 세션 토큰 생성
 * @returns {string} 64자리 랜덤 토큰
 */
function generateSessionToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 64; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

/**
 * 운영자 정보로 부스 운영 시작
 * @param {number} boothId - 부스 ID
 * @param {Object} operatorInfo - 운영자 정보
 * @returns {Promise<Object>} 운영 시작 결과
 */
export async function startBoothOperation(boothId, operatorInfo) {
    try {
        const supabase = getSupabase();
        
        // 필수 정보 검증
        if (!operatorInfo.name || !operatorInfo.phone) {
            return {
                success: false,
                error: '이름과 연락처는 필수 입력 항목입니다.'
            };
        }
        
        // 전화번호 형식 정리
        const phone = operatorInfo.phone.replace(/[^0-9]/g, '');
        if (phone.length < 10) {
            return {
                success: false,
                error: '올바른 전화번호를 입력해주세요.'
            };
        }
        
        if (!supabase) {
            // 목업 모드
            const mockOperation = {
                id: Date.now(),
                booth_id: boothId,
                operator_name: operatorInfo.name,
                operator_phone: phone,
                operator_email: operatorInfo.email || null,
                operator_organization: operatorInfo.organization || null,
                started_at: new Date().toISOString(),
                is_active: true
            };
            
            // 로컬 스토리지에 저장
            localStorage.setItem('current_operation', JSON.stringify(mockOperation));
            localStorage.setItem('session_token', generateSessionToken());
            
            return {
                success: true,
                operation: mockOperation,
                session_token: localStorage.getItem('session_token')
            };
        }
        
        // 기존 활성 운영 확인
        const { data: activeOperations } = await supabase
            .from('booth_operations')
            .select('id')
            .eq('booth_id', boothId)
            .eq('is_active', true);
        
        // 동시 운영자 수 제한 확인 (필요시)
        const { data: booth } = await supabase
            .from('booths')
            .select('max_operators')
            .eq('id', boothId)
            .single();
        
        if (booth && activeOperations && activeOperations.length >= (booth.max_operators || 3)) {
            return {
                success: false,
                error: `이 부스는 최대 ${booth.max_operators || 3}명까지 동시 운영 가능합니다.`
            };
        }
        
        // 운영 기록 생성
        const { data: operation, error: operationError } = await supabase
            .from('booth_operations')
            .insert({
                booth_id: boothId,
                operator_name: operatorInfo.name,
                operator_phone: phone,
                operator_email: operatorInfo.email || null,
                operator_organization: operatorInfo.organization || null,
                started_at: new Date().toISOString(),
                is_active: true,
                notes: operatorInfo.notes || null
            })
            .select()
            .single();
        
        if (operationError) throw operationError;
        
        // 세션 생성
        const sessionToken = generateSessionToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 8); // 8시간 유효
        
        const { error: sessionError } = await supabase
            .from('operator_sessions')
            .insert({
                session_token: sessionToken,
                booth_operation_id: operation.id,
                expires_at: expiresAt.toISOString(),
                ip_address: operatorInfo.ipAddress || null
            });
        
        if (sessionError) throw sessionError;
        
        // 로컬 스토리지에 세션 저장
        localStorage.setItem('session_token', sessionToken);
        localStorage.setItem('current_operation', JSON.stringify(operation));
        
        return {
            success: true,
            operation: operation,
            session_token: sessionToken
        };
        
    } catch (error) {
        console.error('부스 운영 시작 오류:', error);
        return {
            success: false,
            error: error.message || '운영 시작 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 부스 운영 종료
 * @param {number} operationId - 운영 ID
 * @param {string} sessionToken - 세션 토큰
 * @returns {Promise<Object>} 운영 종료 결과
 */
export async function endBoothOperation(operationId, sessionToken = null) {
    try {
        const supabase = getSupabase();
        
        if (!supabase) {
            // 목업 모드
            localStorage.removeItem('current_operation');
            localStorage.removeItem('session_token');
            return {
                success: true,
                message: '운영이 종료되었습니다.'
            };
        }
        
        // 세션 검증 (선택적)
        if (sessionToken) {
            const { data: session } = await supabase
                .from('operator_sessions')
                .select('booth_operation_id')
                .eq('session_token', sessionToken)
                .single();
            
            if (!session || session.booth_operation_id !== operationId) {
                return {
                    success: false,
                    error: '세션이 유효하지 않습니다.'
                };
            }
        }
        
        // 참여자 수 계산
        const { data: participants } = await supabase
            .from('participants')
            .select('id')
            .eq('booth_id', operationId);
        
        const participantCount = participants ? participants.length : 0;
        
        // 운영 종료
        const { data, error } = await supabase
            .from('booth_operations')
            .update({
                ended_at: new Date().toISOString(),
                is_active: false,
                total_participants: participantCount
            })
            .eq('id', operationId)
            .select()
            .single();
        
        if (error) throw error;
        
        // 세션 삭제
        if (sessionToken) {
            await supabase
                .from('operator_sessions')
                .delete()
                .eq('session_token', sessionToken);
        }
        
        // 로컬 스토리지 정리
        localStorage.removeItem('current_operation');
        localStorage.removeItem('session_token');
        
        return {
            success: true,
            message: '운영이 종료되었습니다.',
            operation: data,
            stats: {
                duration: calculateDuration(data.started_at, data.ended_at),
                participants: participantCount
            }
        };
        
    } catch (error) {
        console.error('부스 운영 종료 오류:', error);
        return {
            success: false,
            error: error.message || '운영 종료 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 현재 운영 중인 부스 정보 조회
 * @param {string} sessionToken - 세션 토큰
 * @returns {Promise<Object>} 운영 정보
 */
export async function getCurrentOperation(sessionToken = null) {
    try {
        // 세션 토큰이 없으면 로컬 스토리지에서 가져오기
        if (!sessionToken) {
            sessionToken = localStorage.getItem('session_token');
        }
        
        if (!sessionToken) {
            return {
                success: false,
                error: '세션이 없습니다.'
            };
        }
        
        const supabase = getSupabase();
        
        if (!supabase) {
            // 목업 모드
            const operation = localStorage.getItem('current_operation');
            if (operation) {
                return {
                    success: true,
                    operation: JSON.parse(operation)
                };
            }
            return {
                success: false,
                error: '운영 중인 부스가 없습니다.'
            };
        }
        
        // 세션 조회
        const { data: session, error: sessionError } = await supabase
            .from('operator_sessions')
            .select(`
                *,
                booth_operations (
                    *,
                    booths (
                        id,
                        name,
                        booth_code
                    )
                )
            `)
            .eq('session_token', sessionToken)
            .single();
        
        if (sessionError || !session) {
            return {
                success: false,
                error: '유효하지 않은 세션입니다.'
            };
        }
        
        // 세션 만료 확인
        if (new Date(session.expires_at) < new Date()) {
            // 세션 삭제
            await supabase
                .from('operator_sessions')
                .delete()
                .eq('session_token', sessionToken);
            
            localStorage.removeItem('session_token');
            localStorage.removeItem('current_operation');
            
            return {
                success: false,
                error: '세션이 만료되었습니다.'
            };
        }
        
        // 활동 시간 업데이트
        await supabase
            .from('operator_sessions')
            .update({ last_activity: new Date().toISOString() })
            .eq('session_token', sessionToken);
        
        return {
            success: true,
            operation: session.booth_operations,
            session: session
        };
        
    } catch (error) {
        console.error('현재 운영 조회 오류:', error);
        return {
            success: false,
            error: error.message || '운영 정보 조회 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 부스별 활성 운영자 목록 조회
 * @param {number} boothId - 부스 ID
 * @returns {Promise<Array>} 활성 운영자 목록
 */
export async function getActiveOperators(boothId) {
    try {
        const supabase = getSupabase();
        
        if (!supabase) {
            // 목업 데이터
            return [];
        }
        
        const { data, error } = await supabase
            .from('booth_operations')
            .select('*')
            .eq('booth_id', boothId)
            .eq('is_active', true)
            .order('started_at', { ascending: false });
        
        if (error) throw error;
        
        return data || [];
        
    } catch (error) {
        console.error('활성 운영자 조회 오류:', error);
        return [];
    }
}

/**
 * 운영 시간 계산
 * @param {string} startTime - 시작 시간
 * @param {string} endTime - 종료 시간
 * @returns {Object} 운영 시간 정보
 */
function calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end - start;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
        hours: hours,
        minutes: minutes,
        totalMinutes: Math.floor(diffMs / (1000 * 60)),
        formatted: `${hours}시간 ${minutes}분`
    };
}

/**
 * 운영 기록 조회
 * @param {Object} filters - 필터 옵션
 * @returns {Promise<Array>} 운영 기록 목록
 */
export async function getOperationHistory(filters = {}) {
    try {
        const supabase = getSupabase();
        
        if (!supabase) {
            return [];
        }
        
        let query = supabase
            .from('booth_operations')
            .select(`
                *,
                booths (
                    id,
                    name
                )
            `);
        
        // 필터 적용
        if (filters.boothId) {
            query = query.eq('booth_id', filters.boothId);
        }
        
        if (filters.operatorName) {
            query = query.ilike('operator_name', `%${filters.operatorName}%`);
        }
        
        if (filters.startDate) {
            query = query.gte('started_at', filters.startDate);
        }
        
        if (filters.endDate) {
            query = query.lte('started_at', filters.endDate);
        }
        
        if (filters.isActive !== undefined) {
            query = query.eq('is_active', filters.isActive);
        }
        
        // 정렬
        query = query.order('started_at', { ascending: false });
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        // 운영 시간 계산 추가
        return (data || []).map(op => ({
            ...op,
            duration: calculateDuration(op.started_at, op.ended_at)
        }));
        
    } catch (error) {
        console.error('운영 기록 조회 오류:', error);
        return [];
    }
}

/**
 * 운영 통계 조회
 * @param {number} boothId - 부스 ID (선택적)
 * @returns {Promise<Object>} 운영 통계
 */
export async function getOperationStats(boothId = null) {
    try {
        const supabase = getSupabase();
        
        if (!supabase) {
            return {
                totalOperations: 0,
                activeOperations: 0,
                totalOperators: 0,
                averageDuration: 0,
                totalParticipants: 0
            };
        }
        
        let query = supabase.from('booth_operations').select('*');
        
        if (boothId) {
            query = query.eq('booth_id', boothId);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        const operations = data || [];
        
        // 통계 계산
        const stats = {
            totalOperations: operations.length,
            activeOperations: operations.filter(op => op.is_active).length,
            totalOperators: new Set(operations.map(op => op.operator_phone)).size,
            totalParticipants: operations.reduce((sum, op) => sum + (op.total_participants || 0), 0)
        };
        
        // 평균 운영 시간 계산
        const completedOps = operations.filter(op => op.ended_at);
        if (completedOps.length > 0) {
            const totalMinutes = completedOps.reduce((sum, op) => {
                const duration = calculateDuration(op.started_at, op.ended_at);
                return sum + duration.totalMinutes;
            }, 0);
            stats.averageDuration = Math.round(totalMinutes / completedOps.length);
        } else {
            stats.averageDuration = 0;
        }
        
        return stats;
        
    } catch (error) {
        console.error('운영 통계 조회 오류:', error);
        return {
            totalOperations: 0,
            activeOperations: 0,
            totalOperators: 0,
            averageDuration: 0,
            totalParticipants: 0
        };
    }
}

export default {
    startBoothOperation,
    endBoothOperation,
    getCurrentOperation,
    getActiveOperators,
    getOperationHistory,
    getOperationStats
};