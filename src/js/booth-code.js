/**
 * 부스 코드 관리 모듈
 * 6자리 영숫자 코드 생성 및 검증
 */

import { supabase } from './supabase-client.js';

/**
 * 6자리 랜덤 부스 코드 생성
 * 형식: 3자리 영문 + 3자리 숫자 (예: ABC123)
 */
export function generateBoothCode() {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let code = '';
    
    // 3자리 영문
    for (let i = 0; i < 3; i++) {
        code += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    
    // 3자리 숫자
    for (let i = 0; i < 3; i++) {
        code += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    return code;
}

/**
 * 부스 코드 중복 확인
 */
export async function isCodeUnique(code) {
    try {
        const { data, error } = await supabase
            .from('booths')
            .select('id')
            .eq('booth_code', code)
            .single();
        
        // 데이터가 없으면 중복이 아님
        return !data;
    } catch (error) {
        // 에러가 발생해도 안전하게 처리
        console.error('코드 중복 확인 실패:', error);
        return false;
    }
}

/**
 * 유니크한 부스 코드 생성 (중복 체크 포함)
 */
export async function generateUniqueBoothCode(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        const code = generateBoothCode();
        
        if (await isCodeUnique(code)) {
            return code;
        }
    }
    
    // 여러 번 시도해도 실패하면 타임스탬프 포함
    const timestamp = Date.now().toString(36).substr(-3).toUpperCase();
    return 'XX' + timestamp + Math.floor(Math.random() * 10);
}

/**
 * 부스에 코드 할당
 */
export async function assignCodeToBooth(boothId, expiryDays = 30) {
    try {
        const code = await generateUniqueBoothCode();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiryDays);
        
        const { data, error } = await supabase
            .from('booths')
            .update({
                booth_code: code,
                code_expires_at: expiresAt.toISOString()
            })
            .eq('id', boothId)
            .select();
        
        if (error) throw error;
        
        return {
            success: true,
            code: code,
            expiresAt: expiresAt
        };
    } catch (error) {
        console.error('부스 코드 할당 실패:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 부스 코드 검증
 */
export async function validateBoothCode(code) {
    try {
        const { data, error } = await supabase
            .from('booths')
            .select('id, name, code_expires_at, is_active')
            .eq('booth_code', code)
            .single();
        
        if (error || !data) {
            return {
                isValid: false,
                message: '잘못된 부스 코드입니다.'
            };
        }
        
        // 만료 확인
        if (data.code_expires_at && new Date(data.code_expires_at) < new Date()) {
            return {
                isValid: false,
                message: '만료된 부스 코드입니다.'
            };
        }
        
        // 활성화 확인
        if (!data.is_active) {
            return {
                isValid: false,
                message: '비활성화된 부스입니다.'
            };
        }
        
        return {
            isValid: true,
            boothId: data.id,
            boothName: data.name,
            message: '유효한 부스 코드입니다.'
        };
    } catch (error) {
        console.error('부스 코드 검증 실패:', error);
        return {
            isValid: false,
            message: '코드 검증 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 부스 코드 재생성
 */
export async function regenerateBoothCode(boothId, expiryDays = 30) {
    try {
        // 기존 코드 무효화
        await supabase
            .from('booths')
            .update({
                booth_code: null,
                code_expires_at: null
            })
            .eq('id', boothId);
        
        // 새 코드 생성
        return await assignCodeToBooth(boothId, expiryDays);
    } catch (error) {
        console.error('부스 코드 재생성 실패:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 부스 코드로 운영 시작
 */
export async function startBoothOperation(boothCode, operatorInfo) {
    try {
        // 1. 부스 코드 검증
        const validation = await validateBoothCode(boothCode);
        if (!validation.isValid) {
            return {
                success: false,
                message: validation.message
            };
        }
        
        // 2. 기존 활성 운영 종료
        await supabase
            .from('booth_operations')
            .update({
                is_active: false,
                ended_at: new Date().toISOString()
            })
            .eq('booth_id', validation.boothId)
            .eq('is_active', true);
        
        // 3. 새 운영 시작
        const { data, error } = await supabase
            .from('booth_operations')
            .insert({
                booth_id: validation.boothId,
                operator_name: operatorInfo.name,
                operator_phone: operatorInfo.phone || null,
                started_at: new Date().toISOString(),
                is_active: true
            })
            .select()
            .single();
        
        if (error) throw error;
        
        return {
            success: true,
            operationId: data.id,
            boothId: validation.boothId,
            boothName: validation.boothName,
            message: '부스 운영을 시작했습니다.'
        };
    } catch (error) {
        console.error('부스 운영 시작 실패:', error);
        return {
            success: false,
            message: '운영 시작 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 부스 운영 종료
 */
export async function endBoothOperation(operationId) {
    try {
        const { data, error } = await supabase
            .from('booth_operations')
            .update({
                is_active: false,
                ended_at: new Date().toISOString()
            })
            .eq('id', operationId)
            .select();
        
        if (error) throw error;
        
        return {
            success: true,
            message: '부스 운영을 종료했습니다.'
        };
    } catch (error) {
        console.error('부스 운영 종료 실패:', error);
        return {
            success: false,
            message: '운영 종료 중 오류가 발생했습니다.'
        };
    }
}

/**
 * 현재 활성 운영 확인
 */
export async function getActiveOperation(boothId) {
    try {
        const { data, error } = await supabase
            .from('booth_operations')
            .select('*')
            .eq('booth_id', boothId)
            .eq('is_active', true)
            .single();
        
        return data;
    } catch (error) {
        console.error('활성 운영 확인 실패:', error);
        return null;
    }
}

/**
 * 모든 부스의 코드 목록 조회 (관리자용)
 */
export async function getAllBoothCodes() {
    try {
        const { data, error } = await supabase
            .from('booths')
            .select('id, name, booth_code, code_expires_at, is_active')
            .order('name');
        
        if (error) throw error;
        
        return data;
    } catch (error) {
        console.error('부스 코드 목록 조회 실패:', error);
        return [];
    }
}