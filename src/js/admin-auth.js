/**
 * 관리자 인증 모듈
 * admin/0627 고정 계정 및 운영자 계정 관리
 */

import { getSupabase } from './supabase-client.js';

/**
 * 관리자/운영자 로그인
 * @param {string} username - 사용자명
 * @param {string} password - 비밀번호
 * @returns {Promise<Object>} 로그인 결과
 */
export async function adminLogin(username, password) {
    try {
        const supabase = getSupabase();
        
        if (!supabase) {
            // 목업 모드
            if (username === 'admin' && password === '0627') {
                return {
                    success: true,
                    user: { username: 'admin', id: 1 },
                    role: 'admin'
                };
            }
            return { success: false, error: '로그인 실패' };
        }
        
        // 관리자 확인
        const { data: admin, error: adminError } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();
            
        if (admin && !adminError) {
            return {
                success: true,
                user: admin,
                role: 'admin'
            };
        }
        
        // 운영자 확인
        const { data: operator, error: operatorError } = await supabase
            .from('operators')
            .select('*')
            .eq('username', username)
            .eq('password', password)
            .single();
            
        if (operator && !operatorError) {
            return {
                success: true,
                user: operator,
                role: 'operator'
            };
        }
        
        return {
            success: false,
            error: '아이디 또는 비밀번호가 일치하지 않습니다.'
        };
        
    } catch (error) {
        console.error('로그인 오류:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 관리자 비밀번호 변경
 * @param {string} username - 사용자명
 * @param {string} oldPassword - 현재 비밀번호
 * @param {string} newPassword - 새 비밀번호
 * @returns {Promise<Object>} 변경 결과
 */
export async function changePassword(username, oldPassword, newPassword) {
    try {
        const supabase = getSupabase();
        
        if (!supabase) {
            return { success: false, error: 'DB 연결 실패' };
        }
        
        // 현재 비밀번호 확인
        const { data: admin } = await supabase
            .from('admins')
            .select('*')
            .eq('username', username)
            .eq('password', oldPassword)
            .single();
            
        if (!admin) {
            return { success: false, error: '현재 비밀번호가 일치하지 않습니다.' };
        }
        
        // 비밀번호 업데이트
        const { error } = await supabase
            .from('admins')
            .update({ password: newPassword, updated_at: new Date() })
            .eq('username', username);
            
        if (error) throw error;
        
        return { success: true, message: '비밀번호가 변경되었습니다.' };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 부스 운영자 생성
 * @param {Object} operatorData - 운영자 정보
 * @returns {Promise<Object>} 생성 결과
 */
export async function createOperator(operatorData) {
    try {
        const supabase = getSupabase();
        
        if (!supabase) {
            return { success: false, error: 'DB 연결 실패' };
        }
        
        const { data, error } = await supabase
            .from('operators')
            .insert(operatorData)
            .select()
            .single();
            
        if (error) throw error;
        
        return { success: true, data };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export default {
    adminLogin,
    changePassword,
    createOperator
};