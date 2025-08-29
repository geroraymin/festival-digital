/**
 * 접근 권한 제어 모듈
 * 관리자, 운영자별 권한 체크 및 UI 제어
 */

import { getOperatorSession, isOperator, hasBoothAccess } from './operator-auth.js';

// 사용자 역할 타입
export const UserRole = {
    ADMIN: 'admin',
    OPERATOR: 'operator',
    GUEST: 'guest'
};

/**
 * 현재 사용자의 역할 확인
 */
export function getCurrentUserRole() {
    // 관리자 세션 확인
    const adminSession = JSON.parse(localStorage.getItem('admin_session') || '{}');
    if (adminSession.username === 'admin') {
        return UserRole.ADMIN;
    }
    
    // 운영자 세션 확인
    if (isOperator()) {
        return UserRole.OPERATOR;
    }
    
    return UserRole.GUEST;
}

/**
 * 관리자 권한 확인
 */
export function isAdmin() {
    return getCurrentUserRole() === UserRole.ADMIN;
}

/**
 * 특정 부스에 대한 접근 권한 확인
 */
export function canAccessBooth(boothId) {
    const role = getCurrentUserRole();
    
    // 관리자는 모든 부스 접근 가능
    if (role === UserRole.ADMIN) {
        return true;
    }
    
    // 운영자는 자신의 부스만 접근 가능
    if (role === UserRole.OPERATOR) {
        return hasBoothAccess(boothId);
    }
    
    // 게스트는 접근 불가
    return false;
}

/**
 * 부스 생성 권한 확인
 */
export function canCreateBooth() {
    return isAdmin();
}

/**
 * 부스 삭제 권한 확인
 */
export function canDeleteBooth() {
    return isAdmin();
}

/**
 * 부스 편집 권한 확인
 */
export function canEditBooth(boothId) {
    return isAdmin();
}

/**
 * 부스 코드 관리 권한 확인
 */
export function canManageBoothCodes() {
    return isAdmin();
}

/**
 * 통계 전체 보기 권한 확인
 */
export function canViewAllStats() {
    return isAdmin();
}

/**
 * 데이터 내보내기 권한 확인
 */
export function canExportData() {
    return isAdmin();
}

/**
 * UI 요소 권한별 표시/숨김 처리
 */
export function applyAccessControl() {
    const role = getCurrentUserRole();
    
    // 권한별 UI 요소 클래스
    const adminOnly = document.querySelectorAll('.admin-only');
    const operatorOnly = document.querySelectorAll('.operator-only');
    const authRequired = document.querySelectorAll('.auth-required');
    const guestOnly = document.querySelectorAll('.guest-only');
    
    // 모든 요소 숨김
    adminOnly.forEach(el => el.style.display = 'none');
    operatorOnly.forEach(el => el.style.display = 'none');
    authRequired.forEach(el => el.style.display = 'none');
    guestOnly.forEach(el => el.style.display = 'none');
    
    // 역할별 요소 표시
    switch(role) {
        case UserRole.ADMIN:
            adminOnly.forEach(el => el.style.display = '');
            authRequired.forEach(el => el.style.display = '');
            break;
        case UserRole.OPERATOR:
            operatorOnly.forEach(el => el.style.display = '');
            authRequired.forEach(el => el.style.display = '');
            break;
        case UserRole.GUEST:
            guestOnly.forEach(el => el.style.display = '');
            break;
    }
    
    // 사용자 정보 표시
    updateUserInfo();
}

/**
 * 사용자 정보 UI 업데이트
 */
export function updateUserInfo() {
    const userInfoEl = document.getElementById('userInfo');
    if (!userInfoEl) return;
    
    const role = getCurrentUserRole();
    
    switch(role) {
        case UserRole.ADMIN:
            userInfoEl.innerHTML = `
                <span class="text-sm font-medium">관리자</span>
                <button onclick="logout()" class="ml-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">
                    로그아웃
                </button>
            `;
            break;
        case UserRole.OPERATOR:
            const session = getOperatorSession();
            userInfoEl.innerHTML = `
                <span class="text-sm font-medium">${session.operatorName} (${session.boothName})</span>
                <button onclick="logout()" class="ml-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700">
                    운영 종료
                </button>
            `;
            break;
        case UserRole.GUEST:
            userInfoEl.innerHTML = `
                <a href="operator-login.html" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                    운영자 로그인
                </a>
                <a href="admin-login.html" class="ml-2 px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700">
                    관리자 로그인
                </a>
            `;
            break;
    }
}

/**
 * 로그아웃 처리
 */
export async function logout() {
    const role = getCurrentUserRole();
    
    if (role === UserRole.ADMIN) {
        localStorage.removeItem('admin_session');
        window.location.href = 'admin-login.html';
    } else if (role === UserRole.OPERATOR) {
        const { operatorLogout } = await import('./operator-auth.js');
        await operatorLogout();
        window.location.href = 'operator-login.html';
    }
}

/**
 * 권한 없음 메시지 표시
 */
export function showAccessDenied(message = '이 기능에 대한 권한이 없습니다.') {
    alert(message);
}

/**
 * 부스 선택 제한 (운영자용)
 */
export function restrictBoothSelection() {
    const role = getCurrentUserRole();
    
    if (role === UserRole.OPERATOR) {
        const session = getOperatorSession();
        const boothSelect = document.getElementById('boothSelect');
        
        if (boothSelect && session) {
            // 운영자는 자신의 부스만 선택 가능
            boothSelect.value = session.boothId;
            boothSelect.disabled = true;
            
            // 다른 옵션 제거
            const options = boothSelect.querySelectorAll('option');
            options.forEach(option => {
                if (option.value != session.boothId) {
                    option.remove();
                }
            });
        }
    }
}

/**
 * 페이지 접근 권한 체크
 */
export function checkPageAccess(requiredRole) {
    const currentRole = getCurrentUserRole();
    
    if (requiredRole === UserRole.ADMIN && currentRole !== UserRole.ADMIN) {
        alert('관리자 권한이 필요합니다.');
        window.location.href = 'admin-login.html';
        return false;
    }
    
    if (requiredRole === UserRole.OPERATOR && currentRole === UserRole.GUEST) {
        alert('운영자 로그인이 필요합니다.');
        window.location.href = 'operator-login.html';
        return false;
    }
    
    return true;
}

// 전역 함수로 등록 (HTML에서 직접 호출용)
window.logout = logout;