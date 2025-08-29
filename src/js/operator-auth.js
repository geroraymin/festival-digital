/**
 * 운영자 인증 및 세션 관리 모듈
 * 부스 코드를 통한 운영자 접속 및 권한 관리
 */

import { supabase } from './supabase-client.js';
import { validateBoothCode, startBoothOperation, endBoothOperation } from './booth-code.js';

// 운영자 세션 키
const OPERATOR_SESSION_KEY = 'operator_session';

/**
 * 운영자 정보를 세션에 저장
 */
function saveOperatorSession(sessionData) {
    localStorage.setItem(OPERATOR_SESSION_KEY, JSON.stringify(sessionData));
}

/**
 * 운영자 세션 가져오기
 */
export function getOperatorSession() {
    const sessionStr = localStorage.getItem(OPERATOR_SESSION_KEY);
    if (!sessionStr) return null;
    
    try {
        const session = JSON.parse(sessionStr);
        
        // 세션 만료 확인
        if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
            clearOperatorSession();
            return null;
        }
        
        return session;
    } catch (error) {
        console.error('세션 파싱 실패:', error);
        return null;
    }
}

/**
 * 운영자 세션 삭제
 */
export function clearOperatorSession() {
    localStorage.removeItem(OPERATOR_SESSION_KEY);
}

/**
 * 운영자 로그인 (부스 코드 및 정보 입력)
 */
export async function operatorLogin(boothCode, operatorInfo) {
    try {
        // 입력 검증
        if (!boothCode || boothCode.length !== 6) {
            return {
                success: false,
                message: '올바른 부스 코드를 입력해주세요. (6자리)'
            };
        }
        
        if (!operatorInfo.name || operatorInfo.name.trim() === '') {
            return {
                success: false,
                message: '운영자 이름을 입력해주세요.'
            };
        }
        
        // 부스 코드로 운영 시작
        const result = await startBoothOperation(boothCode, {
            name: operatorInfo.name.trim(),
            phone: operatorInfo.phone?.trim() || null
        });
        
        if (!result.success) {
            return result;
        }
        
        // 세션 생성 (24시간 유효)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        
        const session = {
            operationId: result.operationId,
            boothId: result.boothId,
            boothName: result.boothName,
            operatorName: operatorInfo.name,
            operatorPhone: operatorInfo.phone,
            role: 'operator',
            startedAt: new Date().toISOString(),
            expiresAt: expiresAt.toISOString()
        };
        
        // 세션 저장
        saveOperatorSession(session);
        
        return {
            success: true,
            session: session,
            message: `${result.boothName} 부스 운영을 시작합니다.`
        };
    } catch (error) {
        console.error('운영자 로그인 실패:', error);
        return {
            success: false,
            message: '로그인 처리 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 운영자 로그아웃
 */
export async function operatorLogout() {
    try {
        const session = getOperatorSession();
        
        if (session && session.operationId) {
            // 운영 종료
            await endBoothOperation(session.operationId);
        }
        
        // 세션 삭제
        clearOperatorSession();
        
        return {
            success: true,
            message: '부스 운영을 종료했습니다.'
        };
    } catch (error) {
        console.error('운영자 로그아웃 실패:', error);
        
        // 에러가 발생해도 세션은 삭제
        clearOperatorSession();
        
        return {
            success: false,
            message: '로그아웃 처리 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 현재 운영자가 특정 부스에 대한 권한이 있는지 확인
 */
export function hasBoothAccess(boothId) {
    const session = getOperatorSession();
    if (!session) return false;
    
    return session.boothId === boothId;
}

/**
 * 운영자인지 확인
 */
export function isOperator() {
    const session = getOperatorSession();
    return session && session.role === 'operator';
}

/**
 * 운영 중인 부스 정보 가져오기
 */
export function getCurrentBoothInfo() {
    const session = getOperatorSession();
    if (!session) return null;
    
    return {
        boothId: session.boothId,
        boothName: session.boothName,
        operatorName: session.operatorName,
        startedAt: session.startedAt
    };
}

/**
 * 세션 갱신 (활동 시간 업데이트)
 */
export function refreshSession() {
    const session = getOperatorSession();
    if (!session) return false;
    
    // 만료 시간 연장 (24시간)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    session.expiresAt = expiresAt.toISOString();
    
    saveOperatorSession(session);
    return true;
}

/**
 * 운영 통계 가져오기
 */
export async function getOperationStats() {
    try {
        const session = getOperatorSession();
        if (!session || !session.operationId) return null;
        
        // 현재 운영의 참가자 수 조회
        const startTime = new Date(session.startedAt);
        
        const { data, error } = await supabase
            .from('participants')
            .select('id, gender, grade')
            .eq('booth_id', session.boothId)
            .gte('created_at', startTime.toISOString());
        
        if (error) throw error;
        
        // 통계 계산
        const stats = {
            total: data.length,
            male: data.filter(p => p.gender === '남').length,
            female: data.filter(p => p.gender === '여').length,
            elementary: data.filter(p => p.grade === '초등학생').length,
            middle: data.filter(p => p.grade === '중학생').length,
            high: data.filter(p => p.grade === '고등학생').length,
            operationTime: Math.floor((new Date() - startTime) / 1000 / 60) // 분 단위
        };
        
        return stats;
    } catch (error) {
        console.error('운영 통계 조회 실패:', error);
        return null;
    }
}

/**
 * 간단한 운영자 등록 (부스 코드만으로 빠른 시작)
 */
export async function quickOperatorStart(boothCode) {
    // 자동 생성된 임시 이름 사용
    const tempName = `운영자_${Date.now().toString(36).toUpperCase()}`;
    
    return await operatorLogin(boothCode, {
        name: tempName,
        phone: null
    });
}